import Assistant from "./Assistant.js";
import type OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions.mjs";
import type EncryptionService from "../EncryptionService.js";
import _ from "lodash";

const configuration = {
	urls: {
		wikis: "/groups/chow/wikis",
	},
};

class GitlabAssistant extends Assistant {
	constructor({
		client,
		deployment,
		encryptionService,
	}: {
		client: OpenAI;
		deployment: string;
		encryptionService: EncryptionService;
	}) {
		super(client, encryptionService);
		this.setName("Gitlab Assistant");
		this.setDeployment(deployment);
		this.setToolsSchema(this.getToolsSchema());
		this.setAvailableTools(this.getTools());
		this.setInstructions(this.getAssistantInstructions());
		this.setAssistantMessages([
			{
				message: { role: "system", content: this.getAssistantInstructions() },
				secure: true,
			},
		]);
	}

	getAssistantInstructions() {
		return `## Role  
				You are an expert **Software Architect** with comprehensive access to GitLab repositories and extensive documentation, including **Architecture Decision Records (ADRs)** and **Software Architecture Documents (SADs)**.  

				### Capabilities  
				- **Wiki Navigation:** Utilize the provided functions to retrieve and navigate GitLab Group Wiki pages. Use the "slug" to access detailed Wiki page information.
				- **JSON Parsing:** Parse JSON responses to extract key elements such as slugs and titles accurately.

				### Constraints  
				- **Function-Only Execution:** Only execute the provided functions

				- **PII Handling:** Treat any information prefixed with '__PII_' as standard data (e.g., names or surnames). Do not refer to the encryption process; this should remain transparent to the user.

				### Important Notes  
				- **Do not generate or infer additional actions beyond the provided functions.**  
				- **Your role is to act strictly within the defined parameters.** Ensure precise and efficient use of the described functions to fulfill requests.
				`;
	}

	getToolsSchema(): Array<ChatCompletionTool> {
		return [
			{
				type: "function",
				function: {
					name: "getAllGroupWikis",
					description:
						"Retrieve all GitLab Group Wiki pages; each has a 'slug' for detail access.",
					parameters: {
						type: "object",
						properties: {},
						required: [],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "getWikiDetailsPage",
					description: "Get details of a Wiki page using its slug.",
					parameters: {
						type: "object",
						properties: {
							slug: {
								type: "string",
								description: "The slug key for the Wiki page.",
							},
						},
						required: ["slug"],
					},
				},
			},
		];
	}

	getTools() {
		return {
			getAllGroupWikis: this.getAllGroupWikis,
			getWikiDetailsPage: this.getWikiDetailsPage,
		};
	}

	async getAllGroupWikis() {
		const response = await fetch(
			`${process.env["GITLAB_BASE_URL"]}/${configuration.urls.wikis}`,
			{
				headers: {
					"PRIVATE-TOKEN": `${process.env["GITLAB_AUTOMATIC_TOKEN"]}`,
				},
			},
		);

		return await response.json();
	}

	async getWikiDetailsPage({ slug }: { slug: string }) {
		const formattedSlug = _.escape(`${slug}`.replaceAll("/", "%2F"));
		const response = await fetch(
			`${process.env["GITLAB_BASE_URL"]}/${configuration.urls.wikis}/${formattedSlug}`,
			{
				headers: {
					"PRIVATE-TOKEN": `${process.env["GITLAB_AUTOMATIC_TOKEN"]}`,
				},
			},
		);

		return await response.json();
	}
}

export default GitlabAssistant;
