# Multi-Tenant Chat Engine with External Communication

## 🏗️ **Architecture Overview**

```
┌─────────────────┐    ┌──────────────────┐    ┌───────────────────────┐
│   Tenant A      │    │   Chat Engine    │    │    Tenant B           │
│   Agents        │◄──►│   Core System    │◄──►│    Agents             │
│   ├─ Agent1     │    │   ┌─────────────┐│    │    ├─ Agent1          │
│   ├─ Agent2     │    │   │ Multi-Tenant││    │    ├─ Agent2          │
│   └─ Agent3     │    │   │ Database    ││    │    └─ Agent3          │
└─────────────────┘    │   └─────────────┘│    └───────────────────────┘
                       │                  │
                       │   ┌─────────────┐│
                       │   │ Workflow    ││
                       │   │ Engine      ││
                       │   └─────────────┘│
                       └──────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        External Communication Layer                  │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │
│  │   SDK       │    │   SDK       │    │      Direct API         │  │
│  │  Website A  │    │  Website B  │    │      Integration        │  │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘  │
│         │                   │                        │             │
│         ▼                   ▼                        ▼             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │
│  │ Customer 1  │    │ Customer 2  │    │      Customer 3         │  │
│  │ (Tenant A)  │    │ (Tenant B)  │    │      (Tenant A)         │  │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## 🎯 **Key Features Implemented**

### **1. Tenant Isolation**
- **Database Level**: All tables have `tenant_id` as leading index
- **Query Barriers**: Every query includes `tenant_id` in WHERE clause
- **Service Level**: All services enforce tenant context
- **API Level**: Tenant extraction middleware on all routes

### **2. Internal Communication (Agent-to-Agent)**
- Agents within same tenant can chat freely
- Real-time messaging with status tracking
- Conversation management with read receipts
- User presence and online status

### **3. External Communication (Customer-to-Agent)**
- **Visitor Sessions**: Track external website visitors
- **Workflow Engine**: Route chats based on business rules
- **Agent Assignment**: Round-robin, least-active, skill-based routing
- **Queue Management**: Handle waiting customers with position tracking
- **SDK Integration**: Secure API for website chat widgets

## 📊 **Database Schema**

### **Core Multi-Tenant Tables**
```sql
tenants              -- Tenant definitions
users               -- Agents/internal users (tenant_id)
conversations       -- Internal agent conversations (tenant_id)
messages            -- Chat messages (tenant_id)
refresh_tokens      -- Authentication tokens (tenant_id)
```

### **External Communication Tables**
```sql
external_visitors         -- Website visitors (tenant_id, session_id)
external_conversations    -- Customer chats (tenant_id, visitor_id, agent_id)
external_messages         -- External chat messages (tenant_id)
chat_workflows            -- Business rules for chat routing (tenant_id)
chat_sdk_settings         -- SDK configurations per tenant (tenant_id, api_key)
agent_skills             -- Agent capabilities for routing (tenant_id)
agent_availability       -- Agent status and capacity (tenant_id)
```

## 🔄 **Workflow System**

### **Workflow Configuration (JSON)**
```json
{
  "triggers": {
    "business_hours": true,
    "visitor_location": ["US", "CA"],
    "page_url_contains": ["/pricing", "/contact"],
    "visitor_type": "premium"
  },
  "actions": {
    "auto_assign": true,
    "assignment_type": "skill_based",
    "welcome_message": "Hello! How can I help you today?",
    "queue_message": "Please wait, connecting you to an expert...",
    "max_wait_time": 5
  }
}
```

### **Assignment Strategies**
1. **Round Robin**: Fair distribution among available agents
2. **Least Active**: Route to agent with fewest active chats
3. **Skill Based**: Match visitor needs with agent expertise

## 🔌 **SDK Integration**

### **Authentication Flow**
```javascript
// Website implements chat widget
const chatSDK = new ChatEngineSDK({
  apiKey: 'tenant-api-key-here',
  tenantId: 'tenant-uuid',
  domain: 'customer-website.com'
});

// Initialize visitor
const visitor = await chatSDK.initVisitor({
  name: 'John Doe',
  email: 'john@example.com',
  sessionId: generateSessionId()
});

// Start chat
const chat = await chatSDK.startChat({
  visitorId: visitor.id,
  initialMessage: 'I need help with pricing'
});
```

### **Real-time Communication**
```javascript
// Listen for messages
chat.onMessage((message) => {
  if (message.sender_type === 'agent') {
    displayAgentMessage(message);
  }
});

// Send message
await chat.sendMessage({
  content: 'Can you help me understand the pricing?',
  type: 'text'
});
```

## 🔒 **Security Features**

### **API Key Validation**
- Each tenant has unique API key
- Domain-based CORS validation
- Rate limiting per tenant/IP

### **Tenant Isolation**
- All queries include tenant_id barrier
- No cross-tenant data access possible
- Separate authentication contexts

### **Data Privacy**
- Customer data isolated per tenant
- Secure token handling with hashing
- GDPR-compliant data retention

## 📈 **Analytics & Monitoring**

### **Tenant-Level Metrics**
```sql
-- Live dashboard queries
SELECT 
  COUNT(*) as active_chats,
  COUNT(DISTINCT visitor_id) as unique_visitors
FROM external_conversations 
WHERE tenant_id = ? AND DATE(created_at) = CURDATE();
```

### **Performance Metrics**
- Average response time
- Customer satisfaction ratings
- Agent utilization rates
- Queue wait times

## 🚀 **API Endpoints**

### **Internal (Agent-facing)**
```
POST   /auth/login                    # Agent authentication
GET    /conversations                 # Get agent conversations  
POST   /conversations                 # Start internal chat
POST   /conversations/:id/messages    # Send message to colleague
```

### **External (SDK-facing)**
```
POST   /external/visitor/init         # Initialize visitor session
POST   /external/chat/start           # Start customer chat
POST   /external/chat/:id/messages    # Send customer message
GET    /external/chat/:id/messages    # Get chat history
GET    /external/queue/status         # Check queue status
```

## 🔄 **Workflow Processing**

### **Customer Chat Flow**
1. **Visitor Arrives**: SDK initializes session with tenant context
2. **Workflow Triggered**: System evaluates business rules
3. **Agent Assignment**: Routes based on availability and skills
4. **Queue Management**: If no agents available, add to queue
5. **Real-time Chat**: Bidirectional communication established
6. **Chat End**: Satisfaction survey and analytics tracking

### **Agent Management**
1. **Agent Login**: Multi-tenant authentication with tenant context
2. **Status Management**: Available/busy/away status tracking
3. **Chat Assignment**: Receive chats based on capacity and skills
4. **Internal Collaboration**: Chat with colleagues in same tenant
5. **Performance Tracking**: Response times and satisfaction scores

## 🎨 **Customization Per Tenant**

### **Branding**
```json
{
  "primaryColor": "#007bff",
  "secondaryColor": "#6c757d", 
  "fontFamily": "Inter, system-ui",
  "logo": "https://cdn.tenant.com/logo.png"
}
```

### **Widget Configuration**
```json
{
  "position": "bottom-right",
  "theme": "dark",
  "showAvatar": true,
  "enableFileUpload": true,
  "languages": ["en", "es", "fr"]
}
```

## 🔮 **Future Enhancements**

1. **AI Integration**: Chatbot first-response before agent assignment
2. **Video/Voice**: WebRTC integration for video calls
3. **File Sharing**: Secure file upload/download between parties
4. **Mobile SDK**: React Native/Flutter SDK for mobile apps
5. **Advanced Analytics**: ML-powered insights and predictions
6. **Integrations**: CRM, helpdesk, and business tool integrations

This architecture provides a **complete multi-tenant chat engine** that supports both internal team collaboration and external customer support, with proper tenant isolation, workflow automation, and SDK integration for easy deployment across different websites.
