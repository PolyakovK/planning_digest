import { fetchSignedDocumentsFromLinear } from "@/lib/linear";

export const runtime = "nodejs";

export async function GET() {
  try {
    console.log('=== DEBUG REV-96 ENDPOINT ===');
    const documents = await fetchSignedDocumentsFromLinear(7);
    
    return new Response(JSON.stringify({ 
      ok: true, 
      documents,
      count: documents.length,
      message: 'Check Vercel logs for detailed debug output'
    }), { 
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error: any) {
    console.error('Error in debug endpoint:', error);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: error.message 
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}
