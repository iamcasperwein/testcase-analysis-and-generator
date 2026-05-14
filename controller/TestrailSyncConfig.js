const TestrailSyncConfigService = require("../service/TestrailSyncConfigService")

const getAll = async (req, res) => {
	try {
		const result = TestrailSyncConfigService.getAll()
		res.status(200).json({ success: true, data: result })
	} catch (error) {
		const statusCode = error.statusCode || 500
		res.status(statusCode).json({ success: false, error: error.message })
	}
}

const upsert = async (req, res) => {
	try {
		const { platformGroup, suiteId, suiteName } = req.body || {}
		const result = TestrailSyncConfigService.upsert({ platformGroup, suiteId, suiteName })
		res.status(200).json({ success: true, data: result })
	} catch (error) {
		const statusCode = error.statusCode || 500
		res.status(statusCode).json({ success: false, error: error.message })
	}
}

const remove = async (req, res) => {
	try {
		const platformGroup = req.params.platformGroup || req.query.platformGroup || ""
		const result = TestrailSyncConfigService.remove(platformGroup)
		res.status(200).json({ success: true, data: result })
	} catch (error) {
		const statusCode = error.statusCode || 500
		res.status(statusCode).json({ success: false, error: error.message })
	}
}

module.exports = {
	getAll,
	upsert,
	remove,
}
