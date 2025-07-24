// Optional: Add to ~/server/auth/config.ts if you want Slack login
import SlackProvider from "next-auth/providers/slack";

// Add to providers array:
SlackProvider({
  clientId: process.env.SLACK_CLIENT_ID!,
  clientSecret: process.env.SLACK_CLIENT_SECRET!,
  // This would be for USER login, separate from bot integration
  authorization: {
    params: {
      scope: "identity.basic identity.email identity.team"
    }
  }
})