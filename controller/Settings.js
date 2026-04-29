const SettingsService = require("../service/SettingsService")

const getSettingKeys = async (req, res) => {
	try {
		const keys = await SettingsService.getAvailableKeys()
		res.status(200).json({ success: true, data: keys })
	} catch (error) {
		res.status(500).json({ success: false, error: error.message })
	}
}

const getSettings = async (req, res) => {
	try {
		const settings = await SettingsService.getSettings()
		res.status(200).json({ success: true, data: settings })
	} catch (error) {
		res.status(500).json({ success: false, error: error.message })
	}
}

const createSettings = async (req, res) => {
	try {
		const result = await SettingsService.createSettings(req.body || {})
		res.status(201).json({
			success: true,
			message: "Settings saved successfully",
			data: result,
		})
	} catch (error) {
		const statusCode = error.statusCode || 400
		res.status(statusCode).json({ success: false, error: error.message })
	}
}

const updateSetting = async (req, res) => {
	try {
		const key = String(req.params.key || "").trim()
		const value = Object.prototype.hasOwnProperty.call(req.body || {}, "value")
			? req.body.value
			: req.body?.[key]

		const result = await SettingsService.updateSetting(key, value)
		res.status(200).json({
			success: true,
			message: "Setting updated successfully",
			data: result,
		})
	} catch (error) {
		const statusCode = error.statusCode || 400
		res.status(statusCode).json({ success: false, error: error.message })
	}
}

const deleteSetting = async (req, res) => {
	try {
		const key = String(req.params.key || "").trim()
		const result = await SettingsService.deleteSetting(key)
		res.status(200).json({
			success: true,
			message: "Setting deleted successfully",
			data: result,
		})
	} catch (error) {
		const statusCode = error.statusCode || 400
		res.status(statusCode).json({ success: false, error: error.message })
	}
}

module.exports = {
	getSettingKeys,
	getSettings,
	createSettings,
	updateSetting,
	deleteSetting,
}
