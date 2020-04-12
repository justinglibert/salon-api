import { makeId, sleep, getMsSinceEpoch, createRoomIdFromRoomObject } from './handy'
import { v4 as uuidv4 } from 'uuid';
import Pusher from 'pusher';
import fetch from 'node-fetch';

import { PUSHER_SECRET, DAILY_DOMAIN, DAILY_API_KEY } from './secrets';

const pusher = new Pusher({
    appId: '980696',
    key: '9e2ab3e8d8eacf86ae5b',
    secret: PUSHER_SECRET,
    cluster: 'eu',
    encrypted: true
});

// I am sorry for that
enum Gender {
    MALE = "MALE",
    FEMALE = "FEMALE"
}

const NUMBER_OF_PEOPLE_OF_SAME_GENDER = 3

export interface Participant {
    uid: string,
    gender: Gender,
    name: string,
    twitterHandle: string,
    profilePicture: string, // URL
    ranking: string[] // List of ids. Index 0 is the most preferrable
    likes: string[] // Id of People they liked during one on ones
    mutualMatches: Participant[],
    currentRoomId?: string // If this is not undefined, user is in that daily.co room. Otherwise not in a room
}
interface Salon {
    joinId: string,
    pusherChannel: string,
    state: 'WAITING_ROOM' | "GROUP" | "ONE_ON_ONE" | "END"
    participants: Participant[]
    rooms: Room[]
}
interface Room {
    id: string // Same as current roomId in the Participant interface
    action: string // Bold text
    instruction: string // Normal text next to action
    popup?: string // If this is not undefined, a popup with the instructions of the current game will be shown on the client as well as the timer
    timer?: number // Epoch of the timer. If undefined -> no timer
    activeSpeaker?: string // uid of the active speaker
    nextPartOfSequenceButtonText?: string // The label of the button. Can be "End speaker turn" or "Next question" or whatever. it goes to the next part of the game. If undefined there is no button!
}
enum Interrupt {
    NEXT_STATE = "NEXT_STATE",
    CANT_INTERRUPT = "CANT_INTERRUPT"
}
interface Interrupts {
    [key: string]: {
        [key: string]: Interrupt[] // key is the salon id
    }
}
export class State {
    private salons: {
        [key: string]: Salon
    }
    private interrupts: Interrupts
    constructor() {
        this.salons = {}
        this.interrupts = {}
    }
    createSalonWithJoinId(joinId: string) {
        this.salons[joinId] = {
            joinId,
            pusherChannel: joinId,
            state: 'WAITING_ROOM',
            participants: [],
            rooms: []
        }
        this.interrupts[joinId] = {}
        return joinId
    }
    createSalon() {
        const joinId: string = makeId(4)
        this.salons[joinId] = {
            joinId,
            pusherChannel: joinId,
            state: 'WAITING_ROOM',
            participants: [],
            rooms: []
        }
        this.interrupts[joinId] = {}
        return joinId
    }
    getSalons() {
        return this.salons
    }
    async changeState(salonId: string, func: (s: Salon) => any) {
        await func(this.salons[salonId])
        pusher.trigger(salonId, 'STATE_UPDATE', this.salons[salonId]);
    }
    ensureSalonId(salonId: string) {
        if (!Object.keys(this.salons).find(s => s === salonId)) {
            throw new Error("This Salon does not exist")
        }
    }
    async createDailyRoom(roomName: string): Promise<string> {
        const url = 'https://api.daily.co/v1/rooms';
        var headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${DAILY_API_KEY}`,
        }
        var data = {
            "name": roomName,
        }
        const res = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(data) })
        const j = await res.json()
        if (res.status === 200) {
            return j.name
        } else {
            console.error(j)
            throw new Error("Could not create this DailyCo room")
        }
    }
    async deleteAllDailyRooms() {
        const url = 'https://api.daily.co/v1/rooms';
        var headers = {
            "Authorization": `Bearer ${DAILY_API_KEY}`,
        }
        const res = await fetch(url, { method: 'GET', headers: headers })
        const j = await res.json()
        for (const r of j.data) {
            await this.deleteDailyRoom(r.name)
        }
    }
    async deleteDailyRoom(roomName: string) {
        const url = 'https://api.daily.co/v1/rooms/' + roomName;
        var headers = {
            "Authorization": `Bearer ${DAILY_API_KEY}`,
        }
        var data = {
            "name": roomName,
        }
        const res = await fetch(url, { method: 'DELETE', headers: headers })
        const j = await res.json()
        if (res.status === 200) {
            return true
        } else {
            console.error(j)
            throw new Error("Could not delete this DailyCo room")
        }
    }
    sleepOrInterrupt(ms: number, salonId: string, roomId: string, interrupt: Interrupt) {
        return new Promise(async (res, rej) => {
            setTimeout(res, ms)
            const numberOfInterruptsOfInterest = this.interrupts[salonId][roomId].filter(i => i === interrupt).length
            while (true) {
                await sleep(100)
                if (this.interrupts[salonId][roomId].filter(i => i === interrupt).length > numberOfInterruptsOfInterest) {
                    res()
                }
            }
        })
    }
    // ========== Interactive Part =============
    async startGroupRoutine(salonId: string) {
        await this.sleepOrInterrupt(8 * 1000, salonId, salonId + '-group', Interrupt.CANT_INTERRUPT)
        for (const p of this.salons[salonId].participants) {
            await this.changeState(salonId, s => {
                s.rooms[0].action = p.name + ' is going to introduce ' + (p.gender === Gender.MALE ? 'himself' : 'herself')
                s.rooms[0].instruction = p.name + ': Speak for 30 seconds!'
                s.rooms[0].timer = getMsSinceEpoch() + 30 * 1000
                s.rooms[0].nextPartOfSequenceButtonText = 'End speaking turn'
                s.rooms[0].activeSpeaker = p.uid
                s.rooms[0].popup = undefined
            })
            await this.sleepOrInterrupt(30 * 1000, salonId, salonId + '-group', Interrupt.NEXT_STATE)
        }
        await this.changeState(salonId, s => {
            s.rooms[0].action = 'Lock in your ranking!'
            s.rooms[0].instruction = 'We will move to one on ones in 10 seconds'
            s.rooms[0].timer = getMsSinceEpoch() + 10 * 1000
            s.rooms[0].activeSpeaker = undefined
            s.rooms[0].nextPartOfSequenceButtonText = undefined
        })
        await this.sleepOrInterrupt(10 * 1000, salonId, salonId + '-group', Interrupt.CANT_INTERRUPT)
        await this.changeState(salonId, s => {
            s.rooms[0].action = 'Get ready and read the instructions'
            s.rooms[0].instruction = ''
            s.rooms[0].timer = getMsSinceEpoch() + 8 * 1000
            s.rooms[0].activeSpeaker = undefined
            s.rooms[0].nextPartOfSequenceButtonText = undefined
            s.rooms[0].popup = 'Get ready for one on ones! You will soon be moved to individual rooms based on your ranking.'
        })
        await this.sleepOrInterrupt(8 * 1000, salonId, salonId + '-group', Interrupt.CANT_INTERRUPT)
        this.startOneOnOneRoutine(salonId)

    }
    async startOneOnOneRoutine(salonId: string) {
        // What we do is we assign a score to each rank for everybody. So if I rank you one, your score is N wher N is the number of people in my rank.
        // Sum the rank of all combinations (so N^2) and we rerank that.
        // We then go from the top and create rooms based on the common rank. If someone is already in a room, we skip that row
        // Repeat that thing T times where you put a massive penalty on people that have already been together in the rank. You can then reuse the same algorithm
        const oneOnOneRooms: { man: Participant, woman: Participant }[] = []
        for (const i of [1, 2]) {
            const rooms = this.calculateMatches(salonId, oneOnOneRooms)
            oneOnOneRooms.push(...rooms)
            for (const r of rooms) {
                const roomName = r.man.uid + '-' + r.woman.uid
                await this.createDailyRoom(roomName)
                this.addInteruptRoom(salonId, roomName)
            }
            // Will use promise.all when multiple promises in each room
            await this.changeState(salonId, s => {
                s.rooms = rooms.map(r => ({
                    action: `${r.man.name} and ${r.woman.name}: Talk together 💘`,
                    instruction: '',
                    id: createRoomIdFromRoomObject(r),
                    timer: getMsSinceEpoch() + 60 * 1000 // 60 Seconds
                }))
                s.participants = s.participants.map(p => ({
                    ...p,
                    currentRoomId: createRoomIdFromRoomObject(rooms.find(r => r.man.uid === p.uid || r.woman.uid === p.uid) as { man: Participant, woman: Participant })
                }))
            })
            await this.sleepOrInterrupt(60 * 1000, salonId, salonId + '-group', Interrupt.CANT_INTERRUPT)
            for (const r of rooms) {
                const roomName = r.man.uid + '-' + r.woman.uid
                await this.deleteDailyRoom(roomName)
            }
        }
        this.changeState(salonId, s => {
            s.state = 'END'
            for (const man of s.participants.filter(p => p.gender === Gender.MALE)) {
                for (const woman of s.participants.filter(p => p.gender === Gender.FEMALE)) {
                    if(woman.likes.includes(man.uid) && man.likes.includes(woman.uid)){
                        s.participants.find(p => p.uid === man.uid)?.mutualMatches.push(woman)
                        s.participants.find(p => p.uid === woman.uid)?.mutualMatches.push(man)
                    }
                }
            }
        })
    }
    calculateMatches(salonId: string, roomsPreviouslyCreated: { man: Participant, woman: Participant }[]) {
        const commonRanks: { man: Participant, woman: Participant, score: number }[] = []
        if (this.salons[salonId].participants.filter(p => p.gender === Gender.MALE).length !== this.salons[salonId].participants.filter(p => p.gender === Gender.FEMALE).length) {
            throw new Error("Gender imbalance. Can't match")
        }
        // We want to iterate over every different gender combination without repetition
        for (const man of this.salons[salonId].participants.filter(p => p.gender === Gender.MALE)) {
            for (const woman of this.salons[salonId].participants.filter(p => p.gender === Gender.FEMALE)) {
                const manScore = man.ranking.length - man.ranking.findIndex(r => r === woman.uid)
                const womanScore = woman.ranking.length - woman.ranking.findIndex(r => r === man.uid)
                if (roomsPreviouslyCreated.find(r => r.man.uid === man.uid && r.woman.uid === woman.uid)) {
                    // Make the new room impossible because it already happened
                    commonRanks.push({ man: man, woman, score: -100 })
                } else {
                    commonRanks.push({ man, woman, score: manScore + womanScore })
                }
            }
        }
        // Now we sort common ranks in ascending order
        commonRanks.sort((a, b) => {
            if (a.score < b.score) {
                return -1
            } else {
                return 1
            }
        })
        const rooms: { man: Participant, woman: Participant }[] = []
        while (rooms.length < this.salons[salonId].participants.filter(p => p.gender === Gender.MALE).length) {
            if (commonRanks.length === 0) {
                throw new Error("common ranks is empty")
            } else {
                const proposal = commonRanks.pop() as { man: Participant, woman: Participant, score: number }
                if (!rooms.find(r => r.man.uid === proposal?.man.uid || r.woman.uid === proposal?.woman.uid)) {
                    rooms.push({
                        man: proposal.man,
                        woman: proposal.woman
                    })
                }
            }
        }
        return rooms
    }
    // =========================================
    async rpc(salonId: string, userId: string, action: string, payload: any) {
        switch (action) {
            case 'NEXT_STATE':
                this.addInterupt(salonId, payload, Interrupt.NEXT_STATE)
                break;
            case 'UPDATE_RANKING':
                this.changeState(salonId, s => {
                    const p = s.participants.find(s => s.uid === userId)
                    if (p) {
                        p.ranking = payload
                    }
                })
                break;
            case 'LIKE':
                this.changeState(salonId, s => {
                    const p = s.participants.find(s => s.uid === userId)
                    if (p) {
                        p.likes.push(payload)
                    }
                })
                break;
            default:
                throw new Error("This RPC action does not exist");
        }
    }
    private addInterupt(salonId: string, roomId: string, interrupt: Interrupt) {
        if (roomId in this.interrupts[salonId]) {
            this.interrupts[salonId][roomId].push(interrupt)
        } else {
            this.interrupts[salonId][roomId] = []
        }
    }
    private addInteruptRoom(salonId: string, roomId: string){
        if(!(roomId in this.interrupts[salonId])){
            this.interrupts[salonId][roomId] = []
        }
    }
    async addParticipant(salonId: string, gender: Gender, name: string, twitterHandle: string): Promise<{ channelId: string, yourId: string, currentState: Salon }> {
        this.ensureSalonId(salonId)
        if (this.salons[salonId].state !== "WAITING_ROOM") {
            throw new Error("This salon has started and it is not possible to join anymore")
        }
        if(this.salons[salonId].participants.filter(s => s.gender === gender).length >= NUMBER_OF_PEOPLE_OF_SAME_GENDER){
            throw new Error("There are too many " + (gender === Gender.MALE ? 'men' : 'women') + ' in this Salon')
        }

        const uid = Math.random().toString(36).slice(-6);
        await this.changeState(salonId, async (s) => {
            s.participants.push({
                likes: [],
                name,
                gender,
                profilePicture: `https://twivatar.glitch.me/${twitterHandle}`,
                ranking: s.participants.filter(s => s.gender !== gender).map(s => s.uid),
                twitterHandle,
                mutualMatches: [],
                uid,
            })
            // Add the new participant to people ranking
            // Love functional programming
            s.participants = [...s.participants.filter(s => s.gender !== gender).map(s => ({
                ...s,
                ranking: [...s.ranking, uid]
            })), ...s.participants.filter(s => s.gender === gender)]
            // Start the salon if enough people join
            if (s.participants.length === NUMBER_OF_PEOPLE_OF_SAME_GENDER * 2) {
                const roomName = salonId + '-group'
                await this.createDailyRoom(roomName)
                s.state = 'GROUP'
                s.participants = s.participants.map(s => ({
                    ...s,
                    currentRoomId: roomName
                }))
                this.addInteruptRoom(salonId, roomName)

                s.rooms.push({
                    action: 'Read the instructions!',
                    instruction: '',
                    popup: 'Welcome to Salon! You just joined the group video call. You now have a few minutes to introduce yourself 😄. Every participant will get 30 seconds of time. Please don\'t interrupt each other!. When it is your turn to speak, you can also end it early by pressing a button in the top right corner.',
                    id: roomName,
                    timer: getMsSinceEpoch() + 8 * 1000 // 15 Seconds
                })
                console.log('start group routine')
                this.startGroupRoutine(salonId)
            }
        })
        return {
            channelId: salonId,
            yourId: uid,
            currentState: this.salons[salonId]
        }
    }
}