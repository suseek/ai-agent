import type OpenAI from "openai";
import type {
	ChatCompletionAssistantMessageParam,
	ChatCompletionCreateParamsNonStreaming,
	ChatCompletionMessageParam,
	ChatCompletionMessageToolCall,
	ChatCompletionTool,
} from "openai/resources/chat/completions.mjs";
import clc from "cli-color";
import _ from "lodash";
import type EncryptionService from "../EncryptionService";
import type { ChatCompletionToolMessageParam } from "openai/src/resources/index.js";

type ToolFunction = (...args: any[]) => Promise<any>;
type Tools = Record<string, ToolFunction>;

export interface TransferToAssistantI {
	prompt: string;
	assistant: Assistant;
}

type SecureMessage = {
	message: ChatCompletionMessageParam;
	secure?: boolean;
};

class Assistant {
	private readonly client: OpenAI;
	private name?: string;
	private instructions?: string;
	private availableTools?: Tools;
	private deployment: string = "gpt-4o";
	private toolsSchema?: Array<ChatCompletionTool>;
	private assistantMessages: SecureMessage[] = [];
	encryptionService: EncryptionService;
	constructor(client: OpenAI, encryptionService: EncryptionService) {
		this.client = client;
		this.encryptionService = encryptionService;
	}

	getName() {
		return this.name;
	}
	setName(name: string) {
		this.name = name;
	}
	getInstructions() {
		return this.instructions;
	}
	setInstructions(instructions: string) {
		this.instructions = instructions;
	}
	getToolsSchema() {
		return this.toolsSchema;
	}
	setToolsSchema(toolsSchema: Array<ChatCompletionTool>) {
		this.toolsSchema = toolsSchema;
	}

	getAvailaibleTools() {
		return this.availableTools;
	}
	setAvailableTools(availableTools: Tools) {
		this.availableTools = availableTools;
	}

	setDeployment(deployment: string) {
		this.deployment = deployment;
	}

	getDeploment() {
		return this.deployment;
	}

	setAssistantMessages(messages: SecureMessage[]) {
		this.assistantMessages = messages;
	}

	getAssistantMessages() {
		return this.assistantMessages;
	}

	private isAssistantToAsk(obj: TransferToAssistantI) {
		return obj && typeof obj.prompt === "string" && typeof obj.assistant;
	}

	private async sendData({
		client,
		assistant,
		messages,
	}: {
		client: OpenAI;
		assistant: Assistant;
		messages: SecureMessage[];
	}) {
		const chatCompletionRequest: ChatCompletionCreateParamsNonStreaming = {
			model: assistant.getDeploment(),
			messages: messages.filter((m) => m.secure).map((m) => m.message),
			tools: assistant.getToolsSchema(),
		};
		return await client.chat.completions.create(chatCompletionRequest);
	}

	private async secureMessage(
		message: ChatCompletionMessageParam,
	): Promise<SecureMessage> {
		const encryptedMessage = _.cloneDeep(message);
		if (message.content) {
			encryptedMessage.content = JSON.stringify(
				await this.encryptionService.encrypt(message.content),
			);
		}

		return {
			message: encryptedMessage,
			secure: true,
		} as SecureMessage;
	}

	private async addMessage(message: ChatCompletionMessageParam) {
		this.assistantMessages.push(await this.secureMessage(message));
	}

	private async addMessages(messages: ChatCompletionMessageParam[]) {
		this.assistantMessages = [
			...this.assistantMessages,
			...(await Promise.all(
				messages.map(async (m) => await this.secureMessage(m)),
			)),
		];
	}

	private isValidToolCall(toolCall: ChatCompletionMessageToolCall): boolean {
		return !!(
			toolCall.function?.name && this.availableTools?.[toolCall.function.name]
		);
	}

	private async processToolCall(
		toolCall: ChatCompletionMessageToolCall,
	): Promise<ChatCompletionToolMessageParam> {
		const {
			function: { name: functionName, arguments: functionArgs },
			id,
		} = toolCall;

		try {
			const functionToCall = this.availableTools?.[functionName];
			if (!functionToCall) {
				throw new Error(`Function ${functionName} not found`);
			}
			console.log(`Calling function ${functionName}`);
			const args = JSON.parse(functionArgs);
			const decryptedArgs = await this.encryptionService.decrypt(args);
			const response = await functionToCall(decryptedArgs);

			if (this.isAssistantToAsk(response)) {
				const { assistant: targetAssistant, prompt } = response;
				console.info(`Asking ${targetAssistant.getName()}, prompt: ${prompt}`);
				const transferredResponse = await targetAssistant.ask({
					role: "user",
					content: prompt,
				});

				return {
					role: "tool",
					tool_call_id: id,
					content: transferredResponse,
				};
			}

			return {
				role: "tool",
				tool_call_id: id,
				content: response,
			};
		} catch (error) {
			console.error(`Tool call error:`, error);
			const errorContent = await this.encryptionService.encrypt({
				error: error instanceof Error ? error.message : "Unknown error",
			});
			return {
				role: "tool",
				tool_call_id: id,
				content: JSON.stringify(errorContent),
			};
		}
	}

	private async handleToolCalls(
		message: ChatCompletionAssistantMessageParam,
	): Promise<void> {
		if (!message.tool_calls) return;

		if (message.content) {
			const decryptedMessage = await this.encryptionService.decrypt(
				message.content as any,
			);
			console.log(clc.yellow(`${this.getName()} >`) + " " + decryptedMessage);
		}

		const toolResponses = await Promise.all(
			message.tool_calls
				.filter(this.isValidToolCall.bind(this))
				.map(this.processToolCall.bind(this)),
		);

		await this.addMessages(toolResponses);
	}

	async ask(request: ChatCompletionMessageParam): Promise<string> {
		return this.askAssistant({ assistant: this, request });
	}

	private async askAssistant({
		assistant,
		request,
	}: {
		assistant: Assistant;
		request: ChatCompletionMessageParam;
	}): Promise<string> {
		await this.addMessage(request);
		let result = "";

		while (true) {
			const response = await this.sendData({
				client: this.client,
				assistant,
				messages: this.assistantMessages,
			});

			const { finish_reason, message } = response.choices[0];
			await this.addMessage(message);

			if (finish_reason === "tool_calls") {
				await this.handleToolCalls(message);
				continue;
			}

			if (finish_reason === "stop") {
				result = message.content || "";
				break;
			}
		}

		if (!result.trim()) {
			console.warn("Empty result after processing completion");
		}

		return (await this.encryptionService.decrypt(result)) as string;
	}
}

export default Assistant;
