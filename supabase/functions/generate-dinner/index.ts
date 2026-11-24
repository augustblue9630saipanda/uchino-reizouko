import {createDinnerHandler} from './handler.mjs';

// API keys are read only from the Supabase project's server secrets.
Deno.serve(createDinnerHandler({env:(name:string)=>Deno.env.get(name)}));
