export async function GET() {
  return new Response(JSON.stringify({ 
    message: "Test endpoint works!",
    timestamp: new Date().toISOString()
  }), { 
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
