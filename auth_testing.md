# Auth Testing Playbook (Emergent Google Auth)

## Step 1: Create Test User & Session via mongosh
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  role: 'customer',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"

## Step 2: Test backend endpoints
- GET /api/auth/me with Authorization: Bearer <session_token> OR cookie session_token=<token>

## Step 3: Browser testing
Set cookie before navigation:
{ name: "session_token", value: "<token>", domain: "<host>", path: "/", httpOnly: true, secure: true, sameSite: "None" }
