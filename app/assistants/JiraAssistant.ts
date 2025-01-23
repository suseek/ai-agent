import Assistant from "./Assistant.js";
import clc from "cli-color";
import type OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions.mjs";
import type EncryptionService from "../EncryptionService.js";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // for Jira POC

interface TicketsType {
	[key: string]: number;
}

type ConfigurationType = {
	ticketTypes: TicketsType;
};

interface Comment {
	id: string;
	author: string;
	body: string;
	created: string;
}

interface JiraTicketResult {
	key: string;
	summary: string;
	description: string;
	status: string;
	creator: string;
	reporter: string;
	updated: string;
	comments?: Comment[];
}

type JiraNotFoundIssueType = {
	errorMessages: string[];
	errors: {
		summary: string;
	};
};

type JiraSearchIssueType = {
	key: string;
	fields: {
		summary: string;
		comment: {
			comments: [
				{
					author: {
						name: string;
						displayName: string;
					};
					body: string;
					created: string;
				},
			];
		};
		description: string;
		updated: string;
		status: {
			name: string;
		};
		creator: {
			name: string;
			displayName: string;
		};
		reporter: {
			name: string;
			displayName: string;
		};
	};
};

type JiraCreateTicketRequestType = {
	story: string;
	title: string;
	parentTicketKey: string;
	ticketType: number;
};

type JiraCreateTicketType = {
	project: {
		key: string;
	};
	summary: string;
	description: string;
	issuetype: { id: number };
	parent?: { key: string };
};

class JiraAssistant extends Assistant {
	configuration: ConfigurationType;
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
		this.setName("Jira Assistant");
		this.configuration = {
			ticketTypes: {
				task: 10002,
				sub_task: 10003,
				bug: 10004,
			},
		};
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
You are a **JIRA Assistant** designed to handle JIRA-related queries and assist with creating user stories, comments, and ticket summaries using the provided functions only.

### **Core Tasks**

1. **Ticket Summary Retrieval:**
   - When the user's prompt contains **only a JIRA ticket number**, provide a one-sentence summary of the ticket's details.

2. **New Ticket Creation:**
   - Follow the **User Story Format**:
     - **Title:** A concise summary of the story.
     - **User Story:** *As a [type of user], I want [an action] so that [a benefit].*
     - **Acceptance Criteria:** Include clear and measurable conditions for successful completion.
     - **Additional Details:** Add relevant context, notes, dependencies, or constraints.
     - **Ticket Type ID:** Use one of the following based on the ticket type:
       - Task: '10002'
       - Sub-task: '10003'
       - Bug: '10004'
     - **Clarity and Conciseness:** Ensure the story is unambiguous and easy to understand.
     - **User Value Focus:** Highlight the value or benefit to the end-user.

   - Present the **User Story Draft** in markdown for the user’s review and approval before creation.
   - After approval, create the ticket with all the details from the draft and provide the ticket URL.

3. **Adding Comments to Tickets:**
   - Request the comment or relevant keywords from the user.
   - Expand the comment to address the ticket's context, showing a draft in markdown.
   - Seek the user’s approval before adding the comment.

4. **Post-Creation Actions:**
   - After successful creation, display the ticket's URL in this format:
     - '[Ticket-ID|https://www.jira.com/browse/<ticket-number>]'  
       Example: '[JIRA-102|https://www.jira.com/browse/JIRA-102]'.

5. **Handling Errors:**
   - If JIRA returns the error "Unrecognized token '<'", inform the user that the system is not connected to the VPN.

6. **PII Handling:**
   - Personally Identifiable Information (PII) is prefixed with '__PII_'. Treat it as regular information, as it will be decrypted afterward. Do **not** mention encryption to the user.

---

### **Key Requirements**

- **Markdown Formatting:** Use markdown for drafts and ticket links to enhance clarity.
- **User Interaction:** Always ask for approval when presenting drafts or making changes based on new user information.
- **Transparency:** Keep processes clear and user-focused without overcomplicating interactions.

---

## Example Interaction Flow:

1. **Scenario:** The user requests a new ticket creation.
   - Prompt: “Create a new user story for a login feature.”
   - Response:  
     '
     ## User Story Draft:
     - **Title:** Login Feature Implementation  
     - **User Story:** As a user, I want to log into the system securely so that I can access personalized features.  
     - **Acceptance Criteria:**  
       1. Users can log in with valid credentials.  
       2. Invalid login attempts show an error message.  
       3. The login process adheres to security standards.  
     - **Additional Details:**  
       - Dependent on the authentication service availability.  
     '
   - Ask for user approval before proceeding.
   - After approval, create the ticket with all the information given earlier (in a draft) and provide the ticket URL.

2. **Scenario:** User provides only a ticket number.
   - Prompt: “JIRA-102”
   - Response: “Summary for ticket JIRA-102: Resolve the login issue affecting multiple users.”

---

### **IMPORTANT**

Your meticulous responses are crucial for streamlining ticket management. Maintain clarity, focus, and user collaboration at all times.
			  `;
	}

	getToolsSchema(): Array<ChatCompletionTool> {
		return [
			{
				type: "function",
				function: {
					name: "getJiraTicket",
					description: "Retrieve details of a Jira ticket using its number.",
					parameters: {
						type: "object",
						properties: {
							ticketNumber: {
								type: "string",
								description: "The Jira ticket number.",
							},
						},
						required: ["ticketNumber"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "createTicket",
					description: "Create a Jira ticket based on provided details.",
					parameters: {
						type: "object",
						properties: {
							story: {
								type: "string",
								description: "The full Jira user story.",
							},
							title: {
								type: "string",
								description: "The story title.",
							},
							parentTicketKey: {
								type: "string",
								description:
									"Parent ticket key for creating a sub-task (e.g., 'JIRA-123').",
							},
							ticketType: {
								type: "number",
								description:
									"Ticket type ID: task (10002), sub-task (10003), bug (10004).",
							},
						},
						required: ["story", "title", "ticketType"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "searchJiraTickets",
					description:
						"Search for Jira tickets accessible to the user using a JQL query.",
					parameters: {
						type: "object",
						properties: {
							jql: {
								type: "string",
								description: "The JQL query string.",
							},
							maxResults: {
								type: "number",
								description:
									"The number of results that are needed to fulfill the request.",
							},
						},
						required: ["jql", "maxResults"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "addCommentToJiraTicket",
					description: "Add a comment to a Jira ticket.",
					parameters: {
						type: "object",
						properties: {
							ticketNumber: {
								type: "string",
								description: "The Jira ticket number.",
							},
							comment: {
								type: "string",
								description: "The comment content.",
							},
						},
						required: ["ticketNumber", "comment"],
					},
				},
			},
		];
	}

	getTools() {
		return {
			getJiraTicket: this.getJiraTicket,
			createTicket: this.createTicket,
			searchJiraTickets: this.searchJiraTickets,
			addCommentToJiraTicket: this.addCommentToJiraTicket,
		};
	}

	async getJiraTicket({ ticketNumber }: { ticketNumber: string }) {
		try {
			const jiraResponse = await fetch(
				`${process.env["JIRA_BASE_URL"]}/rest/api/latest/issue/${ticketNumber}`,
				{
					headers: {
						Authorization: `Bearer ${process.env["JIRA_API_TOKEN"]}`,
					},
				},
			);

			if (!jiraResponse.ok) {
				const errorText = await jiraResponse.text();
				return {
					type: "error",
					error: `HTTP Error: ${jiraResponse.status}, ${errorText}`,
				};
			}

			const foundJiraTicket = await jiraResponse.json();

			const result: JiraTicketResult = {
				key: foundJiraTicket.key,
				summary: foundJiraTicket.fields.summary,
				description: foundJiraTicket.fields.description,
				status: foundJiraTicket.fields?.status?.name,
				creator: foundJiraTicket.fields.creator.displayName,
				reporter: foundJiraTicket.fields.reporter.displayName,
				updated: foundJiraTicket.fields.updated,
				comments: foundJiraTicket.fields.comment?.comments,
			};

			return result;
		} catch (error: any) {
			console.error(`Execution error: ${error}`);
			return { error: error.message };
		}
	}

	async searchJiraTickets({
		jql,
		maxResults,
	}: {
		jql: string;
		maxResults: number;
	}) {
		console.log(clc.greenBright("JQL I'm using: " + jql));
		const encodedJql = encodeURIComponent(jql);
		const fields = ["key", "summary", "status", "assignee"].join(",");
		const analyzerResponseRaw = await fetch(
			`${process.env["JIRA_BASE_URL"]}/rest/api/latest/search?jql=${encodedJql}&fields=${fields}`,
			{
				headers: { Authorization: `Bearer ${process.env["JIRA_API_TOKEN"]}` },
			},
		);

		try {
			const searchResults = await analyzerResponseRaw.json();
			if (!searchResults) {
				return;
			}

			const result = {
				startAt: searchResults.startAt,
				maxResults: searchResults.maxResults,
				total: searchResults.total,
				issues: searchResults.issues
					.slice(0, maxResults)
					.map((issue: JiraSearchIssueType) => ({
						key: issue.key,
						summary: issue.fields.summary,
						description: issue.fields.description,
					})),
			};

			return result;
		} catch (error: any) {
			console.error(`Execution error: ${error}`);
			return { error: error.message };
		}
	}

	async createTicket({
		story,
		title,
		parentTicketKey,
		ticketType,
	}: JiraCreateTicketRequestType) {
		console.log("creating story...");
		let fields: JiraCreateTicketType = {
			project: {
				key: process.env["JIRA_PROJECT_KEY"] || "",
			},
			summary: title,
			description: story,
			issuetype: { id: ticketType },
		};
		if (parentTicketKey) {
			fields = { ...fields, parent: { key: parentTicketKey } };
		}

		const jiraData = {
			fields: fields,
		};
		try {
			const response = await fetch(
				`${process.env["JIRA_BASE_URL"]}/rest/api/latest/issue`,
				{
					method: "POST",
					body: JSON.stringify(jiraData).replace(/'/g, "'\\''"),
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${process.env["JIRA_API_TOKEN"]}`,
					},
				},
			);
			const result = await response.json();
			if (result.errorMessages || result.errors) {
				(result.errorMessages || result.errors).forEach((error: string) => {
					console.error(`Execution error: ${error}`);
				});

				return { errors: result.errorMessages };
			}
			return result;
		} catch (error: any) {
			console.error(`Execution error: ${error}`);
			return { error: error.message };
		}
	}

	async addCommentToJiraTicket({
		ticketNumber,
		comment,
	}: {
		ticketNumber: string;
		comment: string;
	}) {
		const response = await fetch(
			`${process.env["JIRA_BASE_URL"]}/rest/api/latest/issue/${ticketNumber}/comment`,
			{
				method: "POST",
				body: JSON.stringify({ body: `${comment.replace(/'/g, "'\\''")}` }),
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${process.env["JIRA_API_TOKEN"]}`,
				},
			},
		);

		try {
			const responseJson = await response.json();
			return responseJson;
		} catch (error: any) {
			console.error(`Execution error: ${error}`);
			return { error: error.message };
		}
	}
}

export default JiraAssistant;
