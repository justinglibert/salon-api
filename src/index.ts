import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'

import { State } from './state'
const app = express()
app.use(cors())
app.use(bodyParser.json())


const s = new State()
s.createSalonWithJoinId((1111).toString())
s.deleteAllDailyRooms()

app.get('/',  (req, res) => {
    res.json({ msg: 'This is CORS-enabled for a Single Route' })
})

app.post('/join', async (req, res) => {
    console.log("New user joined!")
    try {
    const {salonId, gender, name, twitterHandle} = req.body

    const ret = await s.addParticipant(salonId, gender, name, twitterHandle)
    res.json(ret)
    } catch(e) {
        console.error(e)
        res.status(400).json({
            error: e.toString()
        })
    }
})

app.post('/rpc', async (req, res) => {
    console.log("RPC: ", req.body)
    try {
    const {salonId, userId, action, payload} = req.body
    await s.rpc(salonId, userId, action, payload)
    res.sendStatus(200)
    } catch(e) {
        console.error(e)
        res.status(400).json({
            error: e.toString()
        })
    }
})

app.post('/createSalon', (req, res) => {
    console.log("Salon creation initiated")
    try {
    const joinId = s.createSalon()
    console.log(s.getSalons())
    res.json({
        joinId
    })
    } catch(e) {
        res.status(400).json({
            error: e.toString()
        })
    }
})

app.listen(3333, function () {
    console.log('CORS-enabled web server listening on port 3333')
})