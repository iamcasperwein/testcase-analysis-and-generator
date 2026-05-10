const TestrailService = require("../service/TestrailService")

const getSections = async (req, res) => {
	try {
		const result = await TestrailService.getSections()

		res.status(200).json({
			success: true,
			data: result,
		})
	} catch (error) {
		const statusCode = error.statusCode || 500
		res.status(statusCode).json({ success: false, error: error.message })
	}
}

const postTestCases = async (req, res) => {
	try {
		const promptId = String(req.body?.promptId || req.body?.promptID || req.query?.promptId || req.query?.promptID || "").trim()
		const testcaseIds = Array.isArray(req.body?.testcaseIds) ? req.body.testcaseIds : []
		const platformFilter = Array.isArray(req.body?.platformFilter) ? req.body.platformFilter : []

		if (!promptId) {
			return res.status(400).json({ success: false, error: "promptId is required" })
		}

		const result = await TestrailService.postTestCases({ promptId, testcaseIds, platformFilter })

		res.status(200).json({
			success: true,
			message: "Test cases posted to TestRail",
			data: result,
		})
	} catch (error) {
		const statusCode = error.statusCode || (error.code === "ENOENT" ? 404 : 500)
		res.status(statusCode).json({ success: false, error: error.message })
	}
}

module.exports = {
	getSections,
	postTestCases,
}
