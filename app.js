// God I trust You. Guide my steps
const express = require('express')
require('dotenv').config()

const cors = require('cors')
const path = require('path');


const gemini = require("./routes/gemini")
const testCaseRouter = require("./routes/testcaseRouter")

const app = express()
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.urlencoded({ extended: false }))
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')))
app.use('/public', express.static(path.join(__dirname, 'public')))

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'))
})



app.use("/gemini", gemini)
app.use("/testcase", testCaseRouter)




app.listen(port, () => console.log(`generated-ai:${port}`))