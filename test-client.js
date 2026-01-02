const io = require('socket.io-client');
const axios = require('axios');

async function testAuthentication() {
  try {
    console.log('🔐 Testing authentication system...\n');

    // Test registration
    console.log('1. Testing user registration...');
    const registerResponse = await axios.post('http://localhost:3000/auth/register', {
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      role: 'agent'
    });

    console.log('✅ Registration successful');
    const { accessToken, refreshToken } = registerResponse.data.data.tokens;
    console.log('🎫 Received access token:', accessToken.substring(0, 20) + '...');
    console.log('🎫 Received refresh token:', refreshToken.substring(0, 20) + '...\n');

    // Test Socket.IO connection with access token
    console.log('2. Testing Socket.IO connection with access token...');
    const socket = io('http://localhost:3000', {
      auth: {
        token: accessToken
      }
    });

    socket.on('connect', () => {
      console.log('✅ Socket.IO connected successfully!');
      console.log('🔌 Socket ID:', socket.id);
      
      // Test token refresh
      setTimeout(async () => {
        console.log('\n3. Testing token refresh...');
        try {
          const refreshResponse = await axios.post('http://localhost:3000/auth/refresh', {
            refreshToken: refreshToken
          });
          console.log('✅ Token refresh successful');
          console.log('🎫 New access token:', refreshResponse.data.data.tokens.accessToken.substring(0, 20) + '...');
          
          // Test logout
        //   setTimeout(async () => {
        //     console.log('\n4. Testing logout...');
        //     try {
        //       await axios.post('http://localhost:3000/auth/logout', {
        //         refreshToken: refreshToken
        //       }, {
        //         headers: {
        //           'Authorization': `Bearer ${accessToken}`
        //         }
        //       });
        //       console.log('✅ Logout successful');
        //       socket.disconnect();
        //       process.exit(0);
        //     } catch (error) {
        //       console.log('❌ Logout failed:', error.response?.data?.message || error.message);
        //     }
        //   }, 2000);
          
        } catch (error) {
          console.log('❌ Token refresh failed:', error.response?.data?.message || error.message);
        }
      }, 2000);
    });

    socket.on('connect_error', (error) => {
      console.log('❌ Socket connection failed:', error.message);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Disconnected from server');
    });

  } catch (error) {
    if (error.response?.data?.message?.includes('already exists')) {
      console.log('ℹ️  User already exists, testing login instead...');
      
      // Test login
      const loginResponse = await axios.post('http://localhost:3000/auth/login', {
        email: 'test@example.com',
        password: 'password123'
      });
      
      console.log('✅ Login successful');
      const { accessToken } = loginResponse.data.data.tokens;
      
      // Test Socket.IO with login token
      const socket = io('http://localhost:3000', {
        auth: {
          token: accessToken
        }
      });
      
      socket.on('connect', () => {
        console.log('✅ Socket.IO connected with login token!');
        // socket.disconnect();
        // process.exit(0);
      });
      
    } else {
      console.log('❌ Authentication test failed:', error.response?.data?.message || error.message);
    }
  }
}

// Install axios if needed
try {
  require.resolve('axios');
  testAuthentication();
} catch (e) {
  console.log('Installing axios...');
  const { exec } = require('child_process');
  exec('npm install axios', (error) => {
    if (error) {
      console.log('❌ Failed to install axios:', error.message);
    } else {
      console.log('✅ Axios installed, running test...');
      delete require.cache[require.resolve('axios')];
      testAuthentication();
    }
  });
}
