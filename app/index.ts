#! /usr/bin/env bun
import { AzureOpenAI } from "openai";
import dotenv from "dotenv";
import { program } from "commander";
import { input, editor } from "@inquirer/prompts";
import clc from "cli-color";
// @ts-ignore
import cliMd from "cli-markdown";
import JiraAssistant from "./assistants/JiraAssistant.js";
import Assistant from "./assistants/Assistant.js";
import TriageAssistant from "./assistants/TriageAssistant.js";
import GitlabAssistant from "./assistants/GitlabAssistant.js";
import EncryptionService from "./EncryptionService.js";
import * as crypto from "crypto";

interface Config {
	endpoint: string;
	apiKey: string;
	deployment: string;
	apiVersion: string;
}

interface UserPromptResult {
	shouldExit: boolean;
	userPrompt: string;
}

dotenv.config();

// Initialize configuration
const config: Config = {
	endpoint: process.env["AZURE_OPENAI_ENDPOINT"] ?? "",
	apiKey: process.env["AZURE_OPENAI_API_KEY"] ?? "",
	deployment: "gpt-4o",
	apiVersion: "2024-05-01-preview",
};

// Validate configuration
if (!config.endpoint || !config.apiKey) {
	console.error("Error: Missing Azure OpenAI API configuration in .env.");
	process.exit(1);
}

const openAiClient = new AzureOpenAI(config);

async function promptUser(message: string): Promise<UserPromptResult> {
	let shouldExit = false;
	let userPrompt;

	while (!userPrompt || userPrompt.length === 0) {
		userPrompt = await input({
			message,
		});
	}

	if (userPrompt.trim().toLowerCase() === "exit") {
		shouldExit = true;
	} else if (userPrompt.trim().toLowerCase() === "editor") {
		userPrompt = await editor({
			waitForUseInput: false,
			message: clc.greenBright(">"),
		});
	}

	return {
		shouldExit,
		userPrompt,
	};
}

async function initializeAssistants(openAiClient: AzureOpenAI, config: Config) {
	const conversationId = crypto.randomUUID();
	const encryptionService = new EncryptionService({ conversationId });

	try {
		const jiraAssistant = await new JiraAssistant({
			client: openAiClient,
			deployment: config.deployment,
			encryptionService,
		});

		const gitlabAssistant = await new GitlabAssistant({
			client: openAiClient,
			deployment: config.deployment,
			encryptionService,
		});

		const availableAssistants = { gitlabAssistant, jiraAssistant };

		const triageAssistant = await new TriageAssistant({
			client: openAiClient,
			assistants: availableAssistants,
			deployment: config.deployment,
			encryptionService,
		});

		return { triageAssistant, availableAssistants, encryptionService };
	} catch (error) {
		console.error("Failed to initialize assistants:", error);
		process.exit(1);
	}
}

function displayWelcomeMessage(availableAssistants: Record<string, Assistant>) {
	console.log(clc.greenBright.bold.underline("Here's your fellow companion!"));
	console.log(clc.bold.yellowBright("---"));
	console.log(
		`Available assistants: ${Object.values(availableAssistants)
			.map(($) => $.getName())
			.join(", ")}`,
	);
	console.log(`${clc.green("exit")} to ${clc.bold.white("exit")}`);
	console.log(
		`${clc.green("editor")} to ${clc.bold.white("launch your editor")}`,
	);
	console.log(clc.bold.yellowBright("---"));
	console.log(clc.greenBright("How may I assist you today?"));
}

program
	.name("jira-agent")
	.description("Agent for JIRA handling cases")
	.action(async () => {
		const { triageAssistant, availableAssistants, encryptionService } =
			await initializeAssistants(openAiClient, config);

		displayWelcomeMessage(availableAssistants);

		process.on("SIGINT", () => {
			console.log("\nGracefully shutting down... 👋");
			process.exit(0);
		});

		while (true) {
			try {
				const { userPrompt, shouldExit } = await promptUser(
					clc.greenBright("> "),
				);
				if (shouldExit) {
					console.log("Goodbye! 👋");
					return;
				}

				console.log(clc.yellow(`${triageAssistant.getName()} > `));
				const response = await triageAssistant.ask({
					role: "user",
					content: userPrompt,
				});
				const decryptedText = await encryptionService.decrypt(response);
				console.log(cliMd(decryptedText));
			} catch (error) {
				console.error("Error processing request:", error);
			}
		}
	});

program.parse(process.argv);
