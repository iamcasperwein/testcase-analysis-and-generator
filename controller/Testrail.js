const TestrailService = require("../service/testrail/TestrailService")

const getSuites = async (req, res) => {
	try {
		const result = await TestrailService.getSuites()

		res.status(200).json({
			success: true,
			data: result,
		})
	} catch (error) {
		const statusCode = error.statusCode || 500
		res.status(statusCode).json({ success: false, error: error.message })
	}
}

const getSections = async (req, res) => {
	console.log("DEBUGG: Testrail Router: Req Body:", req.body, "Query:", req.query);
	
	try {
		const suiteId = req.query?.suiteId || req.query?.suite_id || null
		const result = await TestrailService.getSections(suiteId)

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
		const platformGroups = Array.isArray(req.body?.platformGroups) ? req.body.platformGroups : []

		if (!promptId) {
			return res.status(400).json({ success: false, error: "promptId is required" })
		}

		const result = await TestrailService.postTestCases({ promptId, testcaseIds, platformFilter, platformGroups })

		const totalPosted = Number(result?.totalPosted || 0)
		const totalFailed = Number(result?.totalFailed || 0)
		const totalSkipped = Number(result?.totalSkipped || 0)

		let success = true
		let message = "Test cases posted to TestRail"

		if (totalPosted === 0 && totalFailed > 0) {
			success = false
			message = `Failed to post all ${totalFailed} test case(s) to TestRail`
		} else if (totalFailed > 0) {
			message = `Partially posted: ${totalPosted} succeeded, ${totalFailed} failed`
		} else if (totalPosted === 0 && totalSkipped > 0) {
			message = `All ${totalSkipped} test case(s) were already posted to TestRail`
		} else if (totalPosted > 0 && totalSkipped > 0) {
			message = `Posted ${totalPosted} test case(s), skipped ${totalSkipped} already posted`
		} else if (totalPosted > 0) {
			message = `Successfully posted ${totalPosted} test case(s) to TestRail`
		}

		const statusCode = success ? 200 : 207
		res.status(statusCode).json({
			success,
			message,
			data: result,
		})
	} catch (error) {
		const statusCode = error.statusCode || (error.code === "ENOENT" ? 404 : 500)
		res.status(statusCode).json({ success: false, error: error.message })
	}
}

module.exports = {
	getSuites,
	getSections,
	postTestCases,
}
