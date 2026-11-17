import {createDinnerHandler} from '../generate-dinner/handler.mjs';

// Test project only: validates a real signed-in user, never reads or writes DB rows.
Deno.serve(createDinnerHandler({env:(name:string)=>Deno.env.get(name),preview:true}));
