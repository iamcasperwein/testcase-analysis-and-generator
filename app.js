// God I trust You. Guide my steps
const express = require('express')
require('dotenv').config()

const cors = require('cors')
const path = require('path');


const qagentRouter = require("./routes/qagentRouter")
const testCaseRouter = require("./routes/testcaseRouter")
const dashboardRouter = require("./routes/dashboardRouter")
const testraiRouter = require("./routes/testrailRouter")
const settingsRouter = require("./routes/settingsRouter")

const app = express()
const port = process.env.PORT || 9009

const allowedOrigins = [
	`http://localhost:${port}`,
	`http://127.0.0.1:${port}`,
]

app.use(cors({
	origin: (origin, callback) => {
		// Allow same-origin, curl, Postman (no Origin header) and file:// (Origin: null)
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



app.listen(port, () => {
	console.log(`generated-ai:${port}`)
	console.log(`Click this url to access the tool --> http://localhost:${port}`)
})