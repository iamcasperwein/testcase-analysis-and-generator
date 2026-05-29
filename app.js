const express = require('express')
const cors = require('cors')
const path = require('path')

const qagentRouter = require("./src/routes/qagentRouter")
const testCaseRouter = require("./src/routes/testcaseRouter")
const dashboardRouter = require("./src/routes/dashboardRouter")
const testraiRouter = require("./src/routes/testrailRouter")
const settingsRouter = require("./src/routes/settingsRouter")
const larkCliRouter = require("./src/routes/larkCliRouter")

const ConfigLoader = require("./src/utils/ConfigLoader")

const app = express()
const port = ConfigLoader.get("PORT", "9009")

const allowedOrigins = [
	`http://localhost:${port}`,
	`http://127.0.0.1:${port}`,
]

app.use(cors({
	origin: (origin, callback) => {
		if (!origin || origin === "null" || allowedOrigins.includes(origin)) {
			return callback(null, true)
		}
		callback(new Error(`CORS: origin '${origin}' is not allowed`))
	},
}))
app.use(express.urlencoded({ extended: false }))
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')))

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.use("/generate", qagentRouter)
app.use("/testcase", testCaseRouter)
app.use("/dashboard", dashboardRouter)
app.use("/testrail", testraiRouter)
app.use("/settings", settingsRouter)
app.use("/lark-cli", larkCliRouter)

app.listen(port, () => {
	console.log(`generated-ai:${port}`)
	console.log(`Click this url to access the tool --> http://localhost:${port}`)
})
