import {createReceiptHandler} from './handler.mjs';
Deno.serve(createReceiptHandler({env:(name:string)=>Deno.env.get(name)}));
