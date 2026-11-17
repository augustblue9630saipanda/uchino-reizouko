import {createDinnerHandler} from './handler.mjs';

// Set these only in the TEST Supabase project's server secrets.
Deno.serve(createDinnerHandler({env:(name:string)=>Deno.env.get(name)}));
