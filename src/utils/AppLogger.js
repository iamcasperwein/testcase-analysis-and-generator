const fs = require("fs")
const path = require("path")

const LOG_ROOT = path.join(__dirname, "../../data")

const ensureDirectory = (targetPath) => {
	fs.mkdirSync(path.dirname(targetPath), { recursive: true })
}

const serializeMeta = (meta) => {
	if (meta == null) return ""
	if (meta instanceof Error) {
		return JSON.stringify({ message: meta.message, stack: meta.stack })
	}

	try {
		return JSON.stringify(meta)
	} catch (error) {
		return JSON.stringify({
			message: "Unable to serialize metadata",
			error: error.message,
		})
	}
}

const toErrorMeta = (errorLike) => {
	if (errorLike instanceof Error) {
		return {
			message: errorLike.message,
			stack: errorLike.stack,
			statusCode: errorLike.statusCode || null,
		}
	}

	return {
		message: String(errorLike || "Unknown error"),
	}
}

const normalizeFileName = ({ service, promptId, fileName }) => {
	if (fileName) return fileName
	if (promptId) return `${promptId}.txt`
	return `runtime/${service}.txt`
}

const getJakartaTimestamp = () => {
	const jakartaEpoch = Date.now() + 7 * 60 * 60 * 1000
	return new Date(jakartaEpoch).toISOString().replace("Z", "+07:00")
}

const createActionLogger = ({
	service = "app",
	action = "operation",
	promptId = null,
	fileName = null,
	resetFile = false,
} = {}) => {
	const safeService = String(service || "app").trim() || "app"
	const safeAction = String(action || "operation").trim() || "operation"
	const safePromptId = promptId == null ? null : String(promptId).trim()
	const relativeFileName = normalizeFileName({ service: safeService, promptId: safePromptId, fileName })
	const logFilePath = path.join(LOG_ROOT, relativeFileName)

	ensureDirectory(logFilePath)
	if (resetFile) {
		fs.writeFileSync(logFilePath, "", "utf8")
	}

	const write = (level, message, meta, consoleMethod = "log") => {
		const timestamp = getJakartaTimestamp()
		const text = String(message || "").trim() || "(no message)"
		const prefix = `[${timestamp}] [${level}] [${safeService}] [${safeAction}]`
		const promptTag = safePromptId ? ` [promptId=${safePromptId}]` : ""
		const metaText = serializeMeta(meta)
		const line = `${prefix}${promptTag} ${text}${metaText ? ` | meta=${metaText}` : ""}`

		const printer = console[consoleMethod] || console.log
		printer(line)
		fs.appendFileSync(logFilePath, `${line}\n`, "utf8")
	}

	return {
		service: safeService,
		action: safeAction,
		promptId: safePromptId,
		logFilePath,
		start: (message = "started", meta) => write("START", message, meta, "log"),
		step: (message, meta) => write("STEP", message, meta, "log"),
		info: (message, meta) => write("INFO", message, meta, "log"),
		success: (message = "completed", meta) => write("SUCCESS", message, meta, "log"),
		warn: (message, meta) => write("WARN", message, meta, "warn"),
		fail: (messageOrError, meta) => {
			if (messageOrError instanceof Error) {
				const errMeta = toErrorMeta(messageOrError)
				write("FAIL", errMeta.message, { ...errMeta, ...(meta || {}) }, "error")
				return
			}

			write("FAIL", messageOrError, meta, "error")
		},
	}
}

module.exports = {
	createActionLogger,
}
