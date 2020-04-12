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