import * as crypto from "crypto";
import * as dotenv from "dotenv";
import { Database } from "bun:sqlite";

type JSONValue = string | number | boolean | JSONObject | JSONArray;
interface JSONObject {
	[key: string]: JSONValue;
}
interface JSONArray extends Array<JSONValue> {}
export type DbRow = {
	id: string;
	original_text: string;
	conversation_id: string;
};

class EncryptionService {
	private conversationId: string;
	private db: Database;

	constructor({ conversationId }: { conversationId: string }) {
		this.db = new Database(":memory:");
		dotenv.config();
		this.conversationId = conversationId;
		this.db.run(`
			CREATE TABLE pii_mappings (
				id TEXT PRIMARY KEY,
				original_text TEXT,
                conversation_id TEXT
			)
		`);
	}

	async analyze(text: string) {
		const analyzerResponseRaw = await fetch("http://localhost:5002/analyze", {
			method: "POST",
			body: JSON.stringify({
				text,
				language: "en",
				ad_hoc_recognizers: [
					{
						name: "JIRA Ticket Recognizer",
						supported_language: "en",
						patterns: [
							{
								name: "jira_ticket_standard",
								regex: "([A-Z]{2,10}-[0-9]{1,5})",
								score: 0.85,
							},
							{
								name: "jira_ticket_extended",
								regex: "(?:^|\\s)([A-Z]{2,10}-\\d+)(?:$|\\s)",
								score: 0.95,
							},
							{
								name: "jira_ticket_with_prefix",
								regex: "(?:jira|ticket|issue|#)\\s*([A-Z]{2,10}-\\d+)",
								score: 0.98,
							},
						],
						context: [
							"jira",
							"ticket",
							"issue",
							"story",
							"bug",
							"task",
							"project",
						],
						supported_entity: "JIRA_TICKET_NUMBER",
					},
				],
			}),
			headers: { "Content-Type": "application/json" },
		});

		return await analyzerResponseRaw.json();
	}

	async encrypt(input: any): Promise<any> {
		if (!input || (typeof input === "string" && input.trim() === "")) {
			return input;
		}

		let dataToEncrypt;

		try {
			dataToEncrypt = JSON.parse(input);
		} catch (error) {
			dataToEncrypt = input;
		}

		if (typeof dataToEncrypt === "string") {
			return await this.encryptString(dataToEncrypt);
		} else if (Array.isArray(dataToEncrypt)) {
			return await Promise.all(dataToEncrypt.map((item) => this.encrypt(item)));
		} else if (typeof dataToEncrypt === "object" && dataToEncrypt !== null) {
			const encryptedObj: JSONObject = {};
			for (const key in dataToEncrypt) {
				encryptedObj[key] = await this.encrypt(dataToEncrypt[key]);
			}
			return encryptedObj;
		}
	}

	private async encryptString(text: string): Promise<string> {
		const prefix = `__PII_`;

		if (text.includes(prefix)) {
			//It's already encrypted.
			return text;
		}

		const foundPIILocations = await this.analyze(text);
		const sortedLocations = foundPIILocations.sort(
			(a: any, b: any) => b.start - a.start,
		);
		let redactedText = text;

		const pIIEntities = new Set<string>(
			sortedLocations
				.filter(
					({ entity_type }: { entity_type: string }) =>
						entity_type !== "JIRA_TICKET_NUMBER",
				)
				.map((entity: { start: number; end: number }) => {
					return redactedText.slice(entity.start, entity.end);
				}),
		);

		pIIEntities.forEach((entity) => {
			const uniqueId = crypto.randomUUID();
			const token = `${prefix}${uniqueId}__`;
			redactedText = redactedText.replaceAll(entity, token);
			this.db.run(
				"INSERT INTO pii_mappings (id, original_text, conversation_id) VALUES (?, ?, ?)",
				[uniqueId, entity, this.conversationId],
			);
		});

		return redactedText;
	}

	async decrypt(input: JSONValue): Promise<JSONValue> {
		if (typeof input === "string") {
			return this.decryptString(input);
		} else if (Array.isArray(input)) {
			return Promise.all(input.map((item) => this.decrypt(item)));
		} else if (typeof input === "object" && input !== null) {
			const decryptedObj: JSONObject = {};
			for (const key in input) {
				decryptedObj[key] = await this.decrypt(input[key]);
			}
			return decryptedObj;
		}
		return input; // Return as is for other types
	}

	private async decryptString(text: string): Promise<string> {
		const piiRegex = /__PII_([a-f0-9-]{36})__/g;
		let decryptedText = text;
		let match: RegExpExecArray | null;

		while ((match = piiRegex.exec(text)) !== null) {
			const [token, id] = match;
			const row = this.db
				.query("SELECT original_text FROM pii_mappings WHERE id = ?")
				.get(id) as DbRow;
			if (row) {
				decryptedText = decryptedText.replace(token, row.original_text);
			}
		}

		return decryptedText;
	}
}

export default EncryptionService;
