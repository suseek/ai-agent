# AI Agent

AI Agent is a command-line tool that integrates with Jira and GitLab to provide AI-powered assistance for project management tasks. It leverages OpenAI's API to help automate and streamline workflows.

## Features

- **Triage Assistant**: Helps triage Jira tickets using AI.
- **Jira Assistant**: Interacts with Jira to retrieve and update ticket information.
- **GitLab Assistant**: Integrates with GitLab for project-related tasks.
- **Encryption Service**: Securely handles sensitive data.

## Prerequisites

- Node.js and npm installed.
- OpenAI API key.
- Jira and GitLab accounts with API access tokens.

## Installation

```bash
bun install
bun link
```

## Configuration

Create a `.env` file in the root directory with the following environment variables:

```bash
# OpenAI API Key
AZURE_OPENAI_API_KEY=your-openai-api-key

# Jira Configuration
JIRA_BASE_URL=https://your-jira-instance.atlassian.net
JIRA_API_TOKEN=your-jira-api-token

# GitLab Configuration
GITLAB_BASE_URL=https://gitlab.com
GITLAB_AUTOMATIC_TOKEN=your-gitlab-private-token
```

## Usage

Run the AI Agent command:

locally `bun ./app/index.ts`

globally, when you first hit `bun link`

```bash
ai-agent [options]
```

### Options

- `--help`: Display help information.
- `--version`: Show the version number.

## Development

### Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/yourusername/ai-agent.git
cd ai-agent
bun install
```

### Running Tests

Execute the test suite with:

```bash
bun test
```

## LLM Usage Scenarios

### 1. Ticket Information Retrieval
The AI can retrieve and summarize Jira ticket information:
```typescript
const response = await triageAssistant.ask({
    content: "What's in JIRA-123?",
    role: "user"
});
// AI will fetch and summarize ticket details including status, priority, and description
```

### 2. Cross-System Information Analysis
Compare information across different systems:
```typescript
const response = await triageAssistant.ask({
    content: "Compare JIRA-1234 Acceptance Criteria with our Environment setting",
    role: "user"
});
// AI will analyze and compare information from both Jira and GitLab wiki
```

### 3. Secure Data Handling
All communications are automatically protected with PII encryption:
- Personal names
- Email addresses
- Social Security Numbers
- Other sensitive information

The system automatically:
- Detects sensitive information
- Replaces it with secure tokens
- Maintains context while keeping data safe
- Restores original data when needed

### 4. Multi-Assistant Orchestration
The Triage Assistant can:
- Route queries to appropriate specialized assistants
- Combine information from multiple sources
- Provide unified responses
- Handle complex multi-step workflows
