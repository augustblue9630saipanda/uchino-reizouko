// No account, email delivery or real confirmation token is used.
// Inspect only the Location produced for an intentionally invalid verification link.
const auth='https://moorgivgwmkbxyjvwuih.supabase.co/auth/v1/verify';
const production='https://augustblue9630saipanda.github.io/uchino-reizouko/';
for(const explicit of [false,true]){
 const request=new URL(auth);request.searchParams.set('type','signup');request.searchParams.set('token','invalid-redirect-check-not-a-real-token');
 if(explicit)request.searchParams.set('redirect_to',production);
 const response=await fetch(request,{redirect:'manual',signal:AbortSignal.timeout(15000)});
 const location=response.headers.get('location');let destination=null,error=null;
 if(location){const target=new URL(location);destination=target.origin+target.pathname;error=new URLSearchParams(target.hash.slice(1)).get('error_code');}
 console.log(JSON.stringify({case:explicit?'explicit-production':'site-url-default',status:response.status,destination,error,productionMatch:destination===production}));
 if(destination!==production)process.exitCode=1;
}
