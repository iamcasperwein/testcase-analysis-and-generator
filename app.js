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

app.use(cors())
app.use(express.urlencoded({ extended: false }))
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')))
app.use('/public', express.static(path.join(__dirname, 'public')))

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