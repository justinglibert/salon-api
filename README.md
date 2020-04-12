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