import {Participant} from './state'
export function makeId(length : number) {
    var result           = '';
    var characters       = '123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
 }

export function sleep(ms : number) {
   return new Promise((resolve) => {
     setTimeout(resolve, ms);
   });
 } 

 export function getMsSinceEpoch() {
   const now = new Date()
   const msSinceEpoch = now.getTime()
   return msSinceEpoch
 }
 export function createRoomIdFromRoomObject(r : {man : Participant, woman: Participant}) {
   return r.man.uid + '-' + r.woman.uid
 }