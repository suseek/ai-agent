import Assistant, { type TransferToAssistantI } from "./Assistant.js";
import type OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/index.mjs";
import type EncryptionService from "../EncryptionService.js";

type AvailableAssistants = {
	[assistantId: string]: Assistant;
};

class TriageAssistant extends Assistant {
	availableAssistants: AvailableAssistants;
	constructor({
		client,
		assistants,
		deployment,
		encryptionService,
	}: {
		client: OpenAI;
		assistants: AvailableAssistants;
		deployment: string;
		encryptionService: EncryptionService;
	}) {
		super(client, encryptionService);
		this.setName("Triage Assistant");
		this.setDeployment(deployment);
		this.setToolsSchema(this.getSchema());
		this.availableAssistants = assistants;
		this.setAvailableTools(this.getTools());
		this.setInstructions(this.getAssistantInstructions());
		this.setAssistantMessages([
			{
				message: { role: "system", content: this.getAssistantInstructions() },
				secure: true,
			},
		]);
	}

	getAssistantInstructions(): string {
		return `## **Role**
				You are a **Triage Assistant** designed to efficiently manage and direct user inquiries.

				#### Responsibilities:

				- **Introduction:** Greet the user briefly upon initiation.

				#### Guidelines:

				- **Function Usage:** Use only the provided functions.
				- **Natural Interaction:** Ask subtle, natural questions to gather necessary information.
				- **Assistant Collaboration:** Trigger other assistants as needed and wait for their response.
				- **Response Handling:** Gather data from other assistants and present it to the user.
				- **Completion:** Conclude the conversation by providing the gathered information or response to the user.
				- **Avoid Repetition:** Do not repeat greetings or instructions.
				- **Maintain Context:** Keep the conversation context throughout.

				**Here are the roles of other assistants you can consult:**

${JSON.stringify(
	Object.values(this.availableAssistants).map((assistant) =>
		assistant.getInstructions(),
	),
)}

			# Any PII information is encrypted, starting with '__PII_'. Treat it as normal information, return it proerly, as it will be decrypted afterwards. Don't mention _encrypting_ to the user - it should be transparent. 
`;
	}

	getSchema(): Array<ChatCompletionTool> {
		return [
			{
				type: "function",
				function: {
					name: "askJiraAgent",
					description: `Transfer any question about Jira tickets, create ticket requests, comment requests and anything related to tasks to Jira agent for further discussion.`,
					parameters: {
						type: "object",
						properties: {
							assistantPrompt: {
								type: "string",
								description: `Prompt for the assistant to manage the task.`,
							},
						},
						required: ["assistantPrompt"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "askGitlabAgent",
					description:
						"Transfer any question about Wiki, code, code architecture or the knowledge base to GitLab agent to receive a meaningful answer and continue the conversation with user.",
					parameters: {
						type: "object",
						properties: {
							assistantPrompt: {
								type: "string",
								description: `Prompt for the assistant to manage the task.`,
							},
						},
						required: ["assistantPrompt"],
					},
				},
			},
		];
	}

	getTools() {
		return {
			askJiraAgent: async ({ assistantPrompt }: { assistantPrompt: string }) => {
				return {
					prompt: assistantPrompt,
					assistant: this.availableAssistants.jiraAssistant,
				} as TransferToAssistantI;
			},
			askGitlabAgent: async ({ assistantPrompt }: { assistantPrompt: string }) => {
				return {
					prompt: assistantPrompt,
					assistant: this.availableAssistants.gitlabAssistant,
				} as TransferToAssistantI;
			},
		};
	}
}

export default TriageAssistant;
