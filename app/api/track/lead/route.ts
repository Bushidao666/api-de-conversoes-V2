import { NextRequest, NextResponse } from 'next/server';
import { sendLeadEvent } from '@/lib/fbevents'; // Assuming fbevents.ts is in src/lib
import type { UserData } from '@/lib/fbevents'; // Import UserData type

const rawAllowedOrigin = process.env.ALLOWED_ORIGIN || 'https://dozeroa100k.com.br';
const ALLOWED_ORIGIN = rawAllowedOrigin.endsWith('/') ? rawAllowedOrigin.slice(0, -1) : rawAllowedOrigin;

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization', // Add any other headers your client might send
  };
}

export async function OPTIONS(request: NextRequest) {
  console.log(`[${new Date().toISOString()}] [LEAD_EVENT] [OPTIONS] Received preflight request from origin: ${request.headers.get('origin')}`);
  const headers = getCorsHeaders();
  return NextResponse.json({}, { status: 200, headers });
}

export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString();
  let eventId = 'N/A'; // Initialize eventId for logging
  const corsHeaders = getCorsHeaders();

  try {
    console.log(`[${timestamp}] [LEAD_EVENT] Received event from client`);
    const body = await request.json();
    eventId = body.eventId || eventId; // Update eventId if available in body
    console.log(`[${timestamp}] [LEAD_EVENT] [${eventId}] Payload from client:`, JSON.stringify(body, null, 2));

    const { 
        userData: clientProvidedUserData, 
        customData: customDataFromClient, 
        eventSourceUrl, 
        urlParameters: urlParametersFromClient 
    } = body;

    const clientIp = request.headers.get('x-forwarded-for') || request.ip;
    // Log for IP is still useful here, as fbevents will use it.
    console.log(`[${timestamp}] [LEAD_EVENT] [${eventId}] Client IP for fbevents: ${clientIp || 'Not found'}`);

    const fbcFromCookieServer = request.cookies.get('_fbc')?.value;
    const fbpFromCookieServer = request.cookies.get('_fbp')?.value;

    let userDataForFbevents: Partial<UserData> = {
      ...clientProvidedUserData,
      fbc: fbcFromCookieServer && (!clientProvidedUserData?.fbc || clientProvidedUserData.fbc !== fbcFromCookieServer)
           ? fbcFromCookieServer
           : clientProvidedUserData?.fbc,
      fbp: fbpFromCookieServer && (!clientProvidedUserData?.fbp || clientProvidedUserData.fbp !== fbpFromCookieServer)
           ? fbpFromCookieServer
           : clientProvidedUserData?.fbp,
    };

    if (fbcFromCookieServer && userDataForFbevents.fbc === fbcFromCookieServer) {
      console.log(`[${timestamp}] [LEAD_EVENT] [${eventId}] Using _fbc from server cookie: ${fbcFromCookieServer}`);
    } else if (userDataForFbevents.fbc) {
      console.log(`[${timestamp}] [LEAD_EVENT] [${eventId}] Using _fbc from client: ${userDataForFbevents.fbc}`);
    } else {
      console.log(`[${timestamp}] [LEAD_EVENT] [${eventId}] No _fbc found from client or server cookie for Lead event.`);
    }

    if (fbpFromCookieServer && userDataForFbevents.fbp === fbpFromCookieServer) {
      console.log(`[${timestamp}] [LEAD_EVENT] [${eventId}] Using _fbp from server cookie: ${fbpFromCookieServer}`);
    } else if (userDataForFbevents.fbp) {
      console.log(`[${timestamp}] [LEAD_EVENT] [${eventId}] Using _fbp from client: ${userDataForFbevents.fbp}`);
    } else {
      console.log(`[${timestamp}] [LEAD_EVENT] [${eventId}] No _fbp found from client or server cookie for Lead event.`);
    }

    console.log(`[${timestamp}] [LEAD_EVENT] [${eventId}] UserData being passed to sendLeadEvent (after server cookie check):`, JSON.stringify(userDataForFbevents, null, 2));
    if (customDataFromClient && Object.keys(customDataFromClient).length > 0) {
      console.log(`[${timestamp}] [LEAD_EVENT] [${eventId}] CustomData from client to be sent:`, JSON.stringify(customDataFromClient, null, 2));
    }
    console.log(`[${timestamp}] [LEAD_EVENT] [${eventId}] Sending event to Facebook Conversions API via sendLeadEvent`);

    const result = await sendLeadEvent(
      request,
      userDataForFbevents as UserData, 
      customDataFromClient || {}, 
      eventSourceUrl,
      eventId,
      urlParametersFromClient 
    );

    console.log(`[${timestamp}] [LEAD_EVENT] [${eventId}] Facebook Conversions API response:`, JSON.stringify(result, null, 2));

    if (result && result.success) {
      console.log(`[${timestamp}] [LEAD_EVENT] [${eventId}] Event processed successfully. fbtrace_id: ${result.fbtrace_id}`);
      return NextResponse.json({
        message: 'Lead event processed successfully',
        fbtrace_id: result.fbtrace_id,
        event_id: eventId,
        success: true
      }, { status: 200, headers: corsHeaders });
    } else {
      console.error(`[${timestamp}] [LEAD_EVENT] [${eventId}] Error processing event:`, result?.error || result?.warning || 'Unknown error');
      return NextResponse.json({
        message: 'Error processing Lead event',
        error: result?.error || result?.warning || 'Unknown error',
        event_id: eventId,
        success: false
      }, { status: 500, headers: corsHeaders });
    }
  } catch (error) {
    const errorTimestamp = new Date().toISOString(); // Use a new timestamp for the error log
    console.error(`[${errorTimestamp}] [LEAD_EVENT_ERROR] [${eventId}] API Lead Error:`, error);
    let errorMessage = 'Internal Server Error';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return NextResponse.json({
        message: 'Error processing Lead event',
        error: errorMessage,
        event_id: eventId,
        success: false
    }, { status: 500, headers: corsHeaders });
  }
} 