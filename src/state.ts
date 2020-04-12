import { makeId } from './handy'
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

interface Participant {
    uid: string,
    gender: Gender,
    name: string,
    twitterHandle: string,
    profilePicture: string, // URL
    ranking: string[] // List of ids. Index 0 is the most preferrable
    likes: string[] // Id of People they liked during one on ones
    currentRoomId?: string // If this is not undefined, user is in that daily.co room. Otherwise not in a room
}
interface Salon {
    joinId: string,
    pusherChannel: string,
    state: 'WAITING_ROOM' | "GROUP" | "ONE_ON_ONE" | "END"
    participants: Participant[]
}
export class State {
    private salons: {
        [key: string]: Salon
    }
    constructor() {
        this.salons = {}
    }
    createSalonWithJoinId(joinId: string) {
        this.salons[joinId] = {
            joinId,
            pusherChannel: joinId,
            state: 'WAITING_ROOM',
            participants: []
        }
        return joinId
    }
    createSalon() {
        const joinId: string = makeId(4)
        this.salons[joinId] = {
            joinId,
            pusherChannel: joinId,
            state: 'WAITING_ROOM',
            participants: []
        }
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
        for(const r of j.data){
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
    async addParticipant(salonId: string, gender: Gender, name: string, twitterHandle: string): Promise<{ channelId: string, yourId: string, currentState: Salon }> {
        this.ensureSalonId(salonId)
        if (this.salons[salonId].state !== "WAITING_ROOM") {
            throw new Error("This salon has started and it is not possible to join anymore")
        }
        const uid = uuidv4()
        await this.changeState(salonId, async (s) => {
            s.participants.push({
                likes: [],
                name,
                gender,
                profilePicture: "https://randomuser.me/api/portraits/men/75.jpg",
                ranking: [],
                twitterHandle,
                uid,
            })
            if (s.participants.length === 4) {
                const roomName = salonId + '-group'
                await this.createDailyRoom(roomName)
                s.state = 'GROUP'
                s.participants = s.participants.map(s => ({
                    ...s,
                    currentRoomId: roomName
                }))
            }
        })
        return {
            channelId: salonId,
            yourId: uid,
            currentState: this.salons[salonId]
        }
    }
}