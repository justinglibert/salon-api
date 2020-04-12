# Architecture
Server exposes two endpoints:
- Join salon
- RPC
## Join Salon
This endpoint gets a meeting ID + a name + a twitter handle as parameters and returns the current state, the name of the Pusher channel to which the client needs to listen to, and the id of that user
## RPC
RPC is how clients modify the global states.
Three parameters: your user id, the action name, and an optionnal payload (when an action name is not enough, like updateRanking -> payload is the ranking)
## Persistence
The state is handled in an in-memory db (just a javascript object) that dies when the server dies (all salon dies and need to be restarted). If this gets too annyoing we'll implement persistence
## TODO and thoughts
- Create a new room entity whose id is the daily-co room, it has attributes like who is talking and what the prompts are (+ a future epoch -- just a number -- so the UI can render a timer). Clients know which one to render based on which room they are on.
- UI Elements in room that are reactive are: Action (bold in Figma), prompt, the uid of who the call should be focusing on (if any), a timestamp for the ticker. If you are the one being focused the UI shows it to you saying that it's your turn to speak. All games are just a sucession of Action/Prompt/UserID tuple