import { expect, test, describe, mock, spyOn, jest, beforeEach, afterEach } from "bun:test";
import TriageAssistant from "../app/assistants/TriageAssistant";
import JiraAssistant from "../app/assistants/JiraAssistant";
import GitlabAssistant from "../app/assistants/GitlabAssistant";
import EncryptionService, { type DbRow } from "../app/EncryptionService";
import OpenAI from "openai";

describe("AI Assistant Tests", () => {
    let encryptionService: EncryptionService;
    let endpoint: string;
    let apiKey: string;
    let deployment: string;

    beforeEach(() => {
        endpoint = "https://fake.localhost:1234/";
        apiKey = "fake-api-key";
        deployment = "gpt-4o";
        process.env.HOME = "/tmp";
        process.env.JIRA_BASE_URL = "http://localjira";
        process.env.GITLAB_BASE_URL = "http://localgitlab";

        mock.module("../app/EncryptionService", () => ({
            encrypt: jest.fn(async (input: any) => input),
            decrypt: jest.fn(async (input: any) => input),
        }));

        encryptionService = new EncryptionService({
            conversationId: "test-convo",
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("Triage Assistant", () => {
        test("asking Triage assistant for a Jira ticket", async () => {
            const aiJiraClient = new OpenAI({
                apiKey,
                baseURL: endpoint,
            });

            const aiTriageClient = new OpenAI({
                apiKey,
                baseURL: endpoint,
            });

            const jiraAgentMock = mock();

            jiraAgentMock.mockImplementationOnce(async (params: any) => {
                return {
                    choices: [
                        {
                            finish_reason: "tool_calls",
                            message: {
                                role: "assistant",
                                content: null,
                                tool_calls: [
                                    {
                                        function: {
                                            name: "getJiraTicket",
                                            arguments: JSON.stringify({
                                                ticketNumber: "JIRA-123",
                                            }),
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                };
            });

            jiraAgentMock.mockImplementationOnce(async (params: any) => {
                return {
                    choices: [
                        {
                            finish_reason: "stop",
                            message: {
                                role: "assistant",
                                content: JSON.stringify({
                                    summary:
                                        "The Jira ticket JIRA-123 is titled 'sweet-july' and involves applying consistent versioning across multiple applications. This sub-task is part of the main task mentioned in ticket JIRA-007. Currently, it is in the 'In Testing' stage and has been assigned a major priority.",
                                }),
                            },
                        },
                    ],
                };
            });

            const triageAgentMock = mock();

            triageAgentMock.mockImplementationOnce(async (params: any) => {
                return {
                    choices: [
                        {
                            finish_reason: "tool_calls",
                            message: {
                                role: "assistant",
                                content: null,
                                tool_calls: [
                                    {
                                        function: {
                                            name: "askJiraAgent",
                                            arguments: `{"assistantPrompt": "What's in JIRA-123?"}`,
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                };
            });

            triageAgentMock.mockImplementationOnce(async (params: any) => {
                return {
                    choices: [
                        {
                            finish_reason: "stop",
                            message: {
                                role: "assistant",
                                content: JSON.stringify({
                                    summary:
                                        "The Jira ticket JIRA-123 is titled 'sweet-july' and involves applying consistent versioning across multiple applications. This sub-task is part of the main task mentioned in ticket JIRA-007. Currently, it is in the 'In Testing' stage and has been assigned a major priority.",
                                }),
                            },
                        },
                    ],
                };
            });

            aiJiraClient.chat = {
                completions: {
                    create: jiraAgentMock,
                },
            } as any;

            aiTriageClient.chat = {
                completions: {
                    create: triageAgentMock,
                },
            } as any;

            spyOn(JiraAssistant.prototype, "getJiraTicket").mockImplementation(
                ({ ticketNumber }: { ticketNumber: string }) =>
                    Promise.resolve({
                        key: ticketNumber,
                        summary: "User Authentication Enhancement",
                        description:
                            '**Summary of Ticket JIRA-123:**\n\nThe ticket titled "sweet-july" pertains to applying consistent versioning to multiple applications, as also described in its parent ticket JIRA-007. Currently, the status of this sub-task is "In Testing," and it is of major priority. The ticket is linked to the main task of ensuring consistent application versioning.',
                        comments: [],
                        creator: "John Doe",
                        reporter: "Jane Doe",
                        status: "In Progress",
                        updated: "2022-01-01T00:00:00.000Z",
                    }),
            );

            // Initialize JiraAssistant
            const jiraAssistant = new JiraAssistant({
                client: aiJiraClient,
                deployment,
                encryptionService,
            });

            // Initialize TriageAssistant with the mocked JiraAssistant
            const triageAssistant = new TriageAssistant({
                client: aiTriageClient,
                assistants: { jiraAssistant },
                deployment,
                encryptionService,
            });

            // Ask the TriageAssistant
            const response = await triageAssistant.ask({
                content: "What's in JIRA-123?",
                role: "user",
            });

            expect(jiraAssistant.getJiraTicket).toHaveBeenCalledWith({
                ticketNumber: "JIRA-123",
            });
            // Expect the response to match the mocked summary
            expect(response).toBe(
                `{\"summary\":\"The Jira ticket JIRA-123 is titled 'sweet-july' and involves applying consistent versioning across multiple applications. This sub-task is part of the main task mentioned in ticket JIRA-007. Currently, it is in the 'In Testing' stage and has been assigned a major priority.\"}`,
            );
        });

        test("asking Triage assistant to compare Jira and GitLab details", async () => {
            const aiJiraClient = new OpenAI({
                apiKey,
                baseURL: endpoint,
            });

            const aiGitlabClient = new OpenAI({
                apiKey,
                baseURL: endpoint,
            });

            const aiTriageClient = new OpenAI({
                apiKey,
                baseURL: endpoint,
            });

            const jiraAgentMock = mock();

            jiraAgentMock.mockImplementationOnce(async (params: any) => {
                return {
                    choices: [
                        {
                            finish_reason: "tool_calls",
                            message: {
                                role: "assistant",
                                content: null,
                                tool_calls: [
                                    {
                                        function: {
                                            name: "getJiraTicket",
                                            arguments: JSON.stringify({
                                                ticketNumber: "JIRA-1234",
                                            }),
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                };

                return {
                    choices: [{}],
                };
            });

            jiraAgentMock.mockImplementationOnce(async (params: any) => {
                return {
                    choices: [
                        {
                            finish_reason: "stop",
                            message: {
                                role: "assistant",
                                content: JSON.stringify({
                                    summary:
                                        "The Jira ticket JIRA-1234 titled 'User Authentication Enhancement' includes acceptance criteria for improving security measures, such as implementing two-factor authentication and password strength validation.",
                                }),
                            },
                        },
                    ],
                };
            });

            const gitlabAgentMock = mock();

            gitlabAgentMock.mockImplementationOnce(async (params: any) => {
                return {
                    choices: [
                        {
                            finish_reason: "tool_calls",
                            message: {
                                role: "assistant",
                                content: null,
                                tool_calls: [
                                    {
                                        function: {
                                            name: "getAllGroupWikis",
                                            arguments: "{}",
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                };
            });

            gitlabAgentMock.mockImplementationOnce(async (params: any) => {
                return {
                    choices: [
                        {
                            finish_reason: "tool_calls",
                            message: {
                                role: "assistant",
                                content: null,
                                tool_calls: [
                                    {
                                        function: {
                                            name: "getWikiDetailsPage",
                                            arguments: JSON.stringify({
                                                slug: "environment-settings",
                                            }),
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                };
            });

            gitlabAgentMock.mockImplementationOnce(async (params: any) => {
                return {
                    choices: [
                        {
                            finish_reason: "stop",
                            message: {
                                role: "assistant",
                                content: JSON.stringify({
                                    summary:
                                        "The environment setting consists of three instances: DEV, TEST and PROD. Each of them have a specific configuration around INTEGRATION-1, INTEGRATION-2 and INTEGRATION-3 urls with the respective API keys and they are based all on basic auth. The PROD has the latest deployment of version 2.5.0.",
                                }),
                            },
                        },
                    ],
                };
            });

            const triageAgentMock = mock();

            triageAgentMock.mockImplementationOnce(async (params: any) => {
                return {
                    choices: [
                        {
                            finish_reason: "tool_calls",
                            message: {
                                role: "assistant",
                                content: null,
                                tool_calls: [
                                    {
                                        function: {
                                            name: "askJiraAgent",
                                            arguments: `{"assistantPrompt": "Give me details on JIRA-1234"}`,
                                        },
                                    },
                                    {
                                        function: {
                                            name: "askGitlabAgent",
                                            arguments: `{"assistantPrompt": "Give me details on our Environment setting from wiki"}`,
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                };
            });

            triageAgentMock.mockImplementationOnce(async (params: any) => {
                return {
                    choices: [
                        {
                            finish_reason: "stop",
                            message: {
                                role: "assistant",
                                content: JSON.stringify({
                                    comparison:
                                        "The acceptance criteria in JIRA-1234 focus on enhancing user authentication mechanisms, including two-factor authentication to all integrations. The environment settings mention three environments that we have right now, DEV, TEST and PROD which have basic auth for each of these, so improving security measures is a must. The PROD environment has the latest deployment of version 2.5.0.",
                                }),
                            },
                        },
                    ],
                };
            });

            aiJiraClient.chat = {
                completions: {
                    create: jiraAgentMock,
                },
            } as any;

            aiGitlabClient.chat = {
                completions: {
                    create: gitlabAgentMock,
                },
            } as any;

            aiTriageClient.chat = {
                completions: {
                    create: triageAgentMock,
                },
            } as any;

            spyOn(JiraAssistant.prototype, "getJiraTicket").mockImplementation(
                ({ ticketNumber }: { ticketNumber: string }) =>
                    Promise.resolve({
                        key: ticketNumber,
                        summary: "User Authentication Enhancement",
                        description:
                            'The Jira ticket JIRA-1234 titled "User Authentication Enhancement" includes acceptance criteria for improving security measures, such as implementing two-factor authentication and password strength validation.',
                        comments: [],
                        creator: "John Doe",
                        reporter: "Jane Doe",
                        status: "In Progress",
                        updated: "2022-01-01T00:00:00.000Z",
                    }),
            );

            spyOn(GitlabAssistant.prototype, "getAllGroupWikis").mockImplementation(
                () =>
                    Promise.resolve([
                        {
                            slug: "environment-settings",
                            title: "Environment Settings",
                        },
                        {
                            slug: "user-authentication-enhancement",
                            title: "User Authentication Enhancement",
                        },
                    ]),
            );

            spyOn(GitlabAssistant.prototype, "getWikiDetailsPage").mockImplementation(
                ({ slug }: { slug: string }) =>
                    Promise.resolve({
                        slug: "environment-settings",
                        title: "Environment Settings",
                        content:
                            "We have instances: DEV, TEST and PROD. There are three integrations: INTEGRATION-1: url: http://localhost:1, INTEGRATION-2: url: http://localhost:2 and INTEGRATION-3: url: http://localhost:3. API keys are: user1/password2. PROD version 2.5.0.",
                    }),
            );

            const jiraAssistant = new JiraAssistant({
                client: aiJiraClient,
                deployment,
                encryptionService,
            });

            const gitlabAssistant = new GitlabAssistant({
                client: aiGitlabClient,
                deployment,
                encryptionService,
            });

            const triageAssistant = new TriageAssistant({
                client: aiTriageClient,
                assistants: { jiraAssistant, gitlabAssistant },
                deployment,
                encryptionService,
            });

            const response = await triageAssistant.ask({
                content:
                    "Compare JIRA-1234 Acceptance Criteria with our Environment setting",
                role: "user",
            });

            expect(jiraAssistant.getJiraTicket).toHaveBeenCalledWith({
                ticketNumber: "JIRA-1234",
            });
            expect(gitlabAssistant.getAllGroupWikis).toHaveBeenCalledTimes(1);
            expect(gitlabAssistant.getWikiDetailsPage).toHaveBeenCalledTimes(1);
            expect(gitlabAssistant.getWikiDetailsPage).toHaveBeenCalledWith({
                slug: "environment-settings",
            });

            expect(response).toBe(
                `{\"comparison\":\"The acceptance criteria in JIRA-1234 focus on enhancing user authentication mechanisms, including two-factor authentication to all integrations. The environment settings mention three environments that we have right now, DEV, TEST and PROD which have basic auth for each of these, so improving security measures is a must. The PROD environment has the latest deployment of version 2.5.0.\"}`,
            );
        });

        test("handles API errors gracefully", async () => {
            const aiClient = new OpenAI({ apiKey, baseURL: endpoint });
            const triageAgentMock = mock();
            
            triageAgentMock.mockImplementationOnce(() => {
                throw new Error("API Error");
            });

            aiClient.chat = {
                completions: { create: triageAgentMock }
            } as any;

            const triageAssistant = new TriageAssistant({
                client: aiClient,
                assistants: {},
                deployment,
                encryptionService,
            });

            await expect(triageAssistant.ask({
                content: "What's in JIRA-123?",
                role: "user"
            })).rejects.toThrow("API Error");
        });
    });

    describe("Encryption Service", () => {
        test("EncryptionService handles encryption and decryption", async () => {
            // Setup
            const conversationId = "test-encryption-convo";
            const encryptionService = new EncryptionService({
                conversationId,
            });

            // Test data
            const sensitiveData = {
                name: "John Smith",
                email: "john.smith@example.com",
                message: "Hello, my SSN is 123-45-6789",
            };

            // Mock PII analyzer response
            spyOn(encryptionService, "analyze").mockImplementation(
                async (param: string) => {
                    if (param.includes("John Smith")) {
                        return [
                            {
                                start: 0,
                                end: 10,
                                entity: "PERSON",
                            },
                        ];
                    } else if (param.includes("john.smith@example.com")) {
                        return [
                            {
                                start: 0,
                                end: 22,
                                entity: "EMAIL_ADDRESS",
                            },
                        ];
                    } else if (param.includes("Hello, my SSN is 123-45-6789")) {
                        return [
                            {
                                start: 17,
                                end: 28,
                                entity: "SSN",
                            },
                        ];
                    }
                },
            );

            // Test encryption
            const encrypted = await encryptionService.encrypt(sensitiveData);

            // Verify encryption
            expect(encrypted.name).toMatch(/__PII_[a-f0-9-]{36}__/);
            expect(encrypted.email).toMatch(/__PII_[a-f0-9-]{36}__/);
            expect(encrypted.message).toMatch(/Hello, my SSN is __PII_[a-f0-9-]{36}__/);

            // Test decryption
            const decrypted = await encryptionService.decrypt(encrypted);

            // Verify decryption restored original values
            expect(decrypted).toEqual(sensitiveData);

            // Verify conversation tracking
            const dbResult = encryptionService["db"]
                .query("SELECT DISTINCT conversation_id FROM pii_mappings")
                .get() as DbRow;
            expect(dbResult.conversation_id).toBe(conversationId);
        });

        test("handles invalid PII data", async () => {
            const encryptionService = new EncryptionService({
                conversationId: "test-invalid-pii"
            });

            spyOn(encryptionService, "analyze").mockImplementation(
                async () => { throw new Error("Invalid PII data"); }
            );

            await expect(encryptionService.encrypt({
                data: "test"
            })).rejects.toThrow("Invalid PII data");
        });

        test("Assistant properly encrypts sensitive data in OpenAI communication", async () => {
            const encryptionService = new EncryptionService({
                conversationId: "test-encryption-openai",
            });

            const aiClient = new OpenAI({
                apiKey,
                baseURL: endpoint,
            });

            // Mock OpenAI completion
            const openAiMock = mock();
            openAiMock.mockImplementation(async (params: any) => {
                // Verify that sensitive data is encrypted in the request

                // First message contains system message, thus we use the second one
                expect(params.messages[1].content).not.toContain(
                    "john.smith@example.com",
                );
                expect(params.messages[1].content).toMatch(
                    /Tell me about __PII_[a-f0-9-]{36}__/,
                );

                return {
                    choices: [
                        {
                            finish_reason: "stop",
                            message: {
                                role: "assistant",
                                content: `This email address: ${
                                    params.messages[1].content.match(/__PII_[a-f0-9-]{36}__/)[0]
                                } needs attention`,
                            },
                        },
                    ],
                };
            });

            aiClient.chat = {
                completions: {
                    create: openAiMock,
                },
            } as any;

            // Mock PII analyzer
            spyOn(encryptionService, "analyze").mockImplementation(
                async (param: string) => {
                    if (param.includes("john.smith@example.com")) {
                        return [
                            {
                                start: param.indexOf("john.smith@example.com"),
                                end:
                                    param.indexOf("john.smith@example.com") +
                                    "john.smith@example.com".length,
                                entity: "EMAIL_ADDRESS",
                            },
                        ];
                    }
                    return [];
                },
            );

            const assistant = new JiraAssistant({
                client: aiClient,
                deployment,
                encryptionService,
            });

            const response = await assistant.ask({
                content: "Tell me about john.smith@example.com",
                role: "user",
            });

            // Verify the response was properly decrypted
            expect(response).toContain("john.smith@example.com");
            expect(response).toMatch(
                "This email address: john.smith@example.com needs attention",
            );
            expect(openAiMock).toHaveBeenCalledTimes(1);
        });
    });
});
