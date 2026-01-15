import { type Metadata } from "next";

export const metadata: Metadata = {
  title: 'Privacy Policy | Exponential',
  description: 'Privacy Policy for Exponential - Learn how we protect your data and respect your privacy.',
};

export default function PrivacyPolicy() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>

      <p className="text-text-muted mb-8">Effective Date: January 14th, 2026</p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Introduction</h2>
        <p className="text-text-secondary mb-4">
          Welcome to Exponential. We value your privacy and are committed to protecting your personal information.
          This Privacy Policy explains how we collect, use, disclose, and safeguard your data when you use our service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Information We Collect</h2>
        <p className="text-text-secondary mb-4">
          We collect the following types of information when you use Exponential:
        </p>

        <div className="mb-4">
          <h3 className="text-xl font-semibold mb-3">Account Information</h3>
          <ul className="list-disc pl-5 text-text-secondary space-y-2">
            <li><strong>Name and Email:</strong> Provided when you sign up or sign in via an authentication provider (Google, Discord, Notion).</li>
            <li><strong>Profile Picture:</strong> Retrieved from your authentication provider if available.</li>
            <li><strong>Authentication Provider:</strong> Which service you use to sign in (Google, Discord, or Notion).</li>
          </ul>
        </div>

        <div className="mb-4">
          <h3 className="text-xl font-semibold mb-3">Content You Create</h3>
          <ul className="list-disc pl-5 text-text-secondary space-y-2">
            <li><strong>Projects:</strong> Project names, descriptions, statuses, and priority levels you create.</li>
            <li><strong>Goals and Outcomes:</strong> Strategic goals and measurable outcomes you define.</li>
            <li><strong>Actions:</strong> Tasks and action items you create and track.</li>
            <li><strong>Journal Entries:</strong> Daily reflections and planning notes you write.</li>
            <li><strong>Workspace Data:</strong> Workspace names, settings, and organizational structure.</li>
          </ul>
        </div>

        <div className="mb-4">
          <h3 className="text-xl font-semibold mb-3">Usage Data</h3>
          <ul className="list-disc pl-5 text-text-secondary space-y-2">
            <li><strong>Device Information:</strong> Browser type, operating system, and device type.</li>
            <li><strong>Log Data:</strong> Pages visited, features used, and timestamps of your activity.</li>
            <li><strong>Session Information:</strong> Login times and session duration.</li>
          </ul>
        </div>

        <div className="mb-4">
          <h3 className="text-xl font-semibold mb-3">Third-Party Integration Data</h3>
          <ul className="list-disc pl-5 text-text-secondary space-y-2">
            <li><strong>Google:</strong> Calendar events, contacts, and profile information (see detailed Google section below).</li>
            <li><strong>Fireflies.ai:</strong> Meeting transcripts and notes if you connect this integration.</li>
          </ul>
        </div>

        <div className="mb-4">
          <h3 className="text-xl font-semibold mb-3">Cookies and Similar Technologies</h3>
          <ul className="list-disc pl-5 text-text-secondary space-y-2">
            <li><strong>Session Cookies:</strong> Essential cookies to maintain your login session and preferences.</li>
            <li><strong>Authentication Tokens:</strong> Secure tokens to verify your identity across requests.</li>
          </ul>
          <p className="text-text-secondary mt-2">
            We do not use third-party advertising or tracking cookies.
          </p>
        </div>
      </section>

      {/* Google User Data Section - Required by Google API Services User Data Policy */}
      <section className="mb-8 p-6 border border-border-primary rounded-lg bg-surface-secondary">
        <h2 className="text-2xl font-semibold mb-4">Google User Data</h2>
        <p className="text-text-secondary mb-4">
          When you connect your Google account to Exponential, we access specific Google user data to provide
          our CRM and productivity features. This section describes exactly what data we access, how we use it,
          and how we protect it.
        </p>

        {/* Data Accessed */}
        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-3">Data We Access</h3>
          <p className="text-text-secondary mb-3">
            Depending on the features you enable, we may request access to the following Google data:
          </p>
          <ul className="list-disc pl-5 text-text-secondary space-y-2">
            <li>
              <strong>Basic Profile Information:</strong> Your name, email address, and profile picture for account identification.
            </li>
            <li>
              <strong>Google Calendar Events:</strong> Event titles, descriptions, times, locations, attendee names and email addresses,
              and conference/meeting links. This allows us to display your schedule and identify contacts you interact with.
            </li>
            <li>
              <strong>Google Contacts:</strong> Names, email addresses, phone numbers, organization names, job titles, and
              profile URLs (including LinkedIn). This enables our CRM features to help you manage your professional relationships.
            </li>
          </ul>
        </div>

        {/* Data Usage */}
        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-3">How We Use Google Data</h3>
          <ul className="list-disc pl-5 text-text-secondary space-y-2">
            <li>
              <strong>Calendar Display:</strong> We display your calendar events within the app to help you plan your day
              and track meetings.
            </li>
            <li>
              <strong>Event Creation:</strong> With your permission, we can create calendar events on your behalf (e.g., scheduling tasks).
            </li>
            <li>
              <strong>Contact Relationship Management:</strong> We import your contacts into our CRM to help you track
              professional relationships, meeting history, and interaction frequency.
            </li>
            <li>
              <strong>Interaction Tracking:</strong> We analyze calendar attendees to identify contacts you frequently meet with
              and calculate relationship strength scores.
            </li>
          </ul>
        </div>

        {/* Data Sharing */}
        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-3">Data Sharing</h3>
          <p className="text-text-secondary mb-3">
            <strong>We do not sell, rent, or share your Google user data with third parties</strong> except in the following limited circumstances:
          </p>
          <ul className="list-disc pl-5 text-text-secondary space-y-2">
            <li>
              <strong>Service Providers:</strong> We use secure cloud infrastructure (Vercel, Railway) to host our application.
              These providers do not have access to your decrypted data.
            </li>
            <li>
              <strong>Legal Requirements:</strong> We may disclose data if required by law, court order, or government request.
            </li>
          </ul>
          <p className="text-text-secondary mt-3">
            We do not use Google user data for advertising purposes. We do not allow humans to read your data
            except where necessary to provide support at your request, or for security purposes.
          </p>
        </div>

        {/* Data Storage & Protection */}
        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-3">Data Storage & Protection</h3>
          <ul className="list-disc pl-5 text-text-secondary space-y-2">
            <li>
              <strong>Encryption at Rest:</strong> Sensitive contact information (email addresses, phone numbers, social media handles)
              is encrypted using AES-256-GCM encryption before storage in our database.
            </li>
            <li>
              <strong>Encryption in Transit:</strong> All data transmitted between your browser, our servers, and Google
              is encrypted using TLS/HTTPS.
            </li>
            <li>
              <strong>Calendar Event Caching:</strong> Calendar events are cached temporarily (up to 15 minutes) in memory
              to improve performance. Events are not permanently stored in our database.
            </li>
            <li>
              <strong>OAuth Token Security:</strong> Your Google authentication tokens are stored securely and used only to
              access Google APIs on your behalf. We use short-lived access tokens with automatic refresh.
            </li>
            <li>
              <strong>Access Controls:</strong> Your data is isolated to your workspace and can only be accessed by
              authenticated users within that workspace.
            </li>
          </ul>
        </div>

        {/* Data Retention & Deletion */}
        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-3">Data Retention & Deletion</h3>
          <ul className="list-disc pl-5 text-text-secondary space-y-2">
            <li>
              <strong>Contact Data:</strong> Imported contacts are retained in your workspace until you delete them or
              delete your account. You can delete individual contacts at any time from the CRM.
            </li>
            <li>
              <strong>Calendar Data:</strong> Calendar events are cached for up to 15 minutes and are not permanently stored.
            </li>
            <li>
              <strong>Account Deletion:</strong> You can request complete deletion of your account and all associated data
              by contacting us at{' '}
              <a href="mailto:privacy@exponential.im" className="text-brand-primary hover:underline">
                privacy@exponential.im
              </a>. We will process deletion requests within 30 days.
            </li>
            <li>
              <strong>Disconnecting Google:</strong> You can disconnect your Google account at any time from your account settings.
              This immediately revokes our access to your Google data. Previously imported contacts will remain in your CRM
              unless you explicitly delete them.
            </li>
          </ul>
        </div>

        {/* Revoking Access */}
        <div className="mb-4">
          <h3 className="text-xl font-semibold mb-3">Revoking Access</h3>
          <p className="text-text-secondary">
            You can revoke Exponential&apos;s access to your Google account at any time by:
          </p>
          <ol className="list-decimal pl-5 text-text-secondary space-y-1 mt-2">
            <li>Disconnecting Google from your Exponential account settings, or</li>
            <li>Visiting your{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-primary hover:underline"
              >
                Google Account permissions page
              </a>
              {' '}and removing Exponential from the list of connected apps.
            </li>
          </ol>
        </div>

        <p className="text-text-secondary mt-4 pt-4 border-t border-border-primary">
          Our use of Google user data adheres to the{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-primary hover:underline"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">How We Store Your Data</h2>
        <p className="text-text-secondary mb-4">
          We take the security of your data seriously. Here is how we store and protect your information:
        </p>

        <div className="mb-4">
          <h3 className="text-xl font-semibold mb-3">Infrastructure</h3>
          <ul className="list-disc pl-5 text-text-secondary space-y-2">
            <li><strong>Application Hosting:</strong> Our application is hosted on Vercel, a secure cloud platform with SOC 2 Type 2 compliance.</li>
            <li><strong>Database:</strong> Your data is stored in a PostgreSQL database hosted on Railway with automated backups.</li>
            <li><strong>Data Location:</strong> Our primary infrastructure is located in the United States and European Union regions.</li>
          </ul>
        </div>

        <div className="mb-4">
          <h3 className="text-xl font-semibold mb-3">Security Measures</h3>
          <ul className="list-disc pl-5 text-text-secondary space-y-2">
            <li><strong>Encryption in Transit:</strong> All data transmitted between your browser and our servers is encrypted using TLS/HTTPS.</li>
            <li><strong>Encryption at Rest:</strong> Sensitive data such as contact information and integration tokens is encrypted using AES-256-GCM before storage.</li>
            <li><strong>Access Controls:</strong> Your data is isolated to your account and workspace. Only authenticated users can access their own data.</li>
            <li><strong>Authentication Security:</strong> We use industry-standard OAuth 2.0 for authentication and store only secure session tokens.</li>
          </ul>
        </div>

        <div className="mb-4">
          <h3 className="text-xl font-semibold mb-3">Backups</h3>
          <p className="text-text-secondary">
            Our database is automatically backed up daily. Backups are encrypted and retained for disaster recovery purposes.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">How We Use Your Information</h2>
        <p className="text-text-secondary mb-4">
          We use the information we collect for the following specific purposes:
        </p>

        <div className="mb-4">
          <h3 className="text-xl font-semibold mb-3">Service Delivery</h3>
          <ul className="list-disc pl-5 text-text-secondary space-y-2">
            <li>Display your projects, goals, outcomes, and actions in the application</li>
            <li>Sync and display your calendar events from connected integrations</li>
            <li>Store and retrieve your journal entries and daily planning notes</li>
            <li>Manage your workspaces and organizational structure</li>
          </ul>
        </div>

        <div className="mb-4">
          <h3 className="text-xl font-semibold mb-3">Personalization</h3>
          <ul className="list-disc pl-5 text-text-secondary space-y-2">
            <li>Remember your preferences and workspace settings</li>
            <li>Provide personalized views based on your usage patterns</li>
            <li>Maintain your session across visits</li>
          </ul>
        </div>

        <div className="mb-4">
          <h3 className="text-xl font-semibold mb-3">Communication</h3>
          <ul className="list-disc pl-5 text-text-secondary space-y-2">
            <li>Send account-related notifications (password resets, security alerts)</li>
            <li>Notify you of important service updates or changes</li>
            <li>Respond to your support requests and inquiries</li>
          </ul>
        </div>

        <div className="mb-4">
          <h3 className="text-xl font-semibold mb-3">Security and Compliance</h3>
          <ul className="list-disc pl-5 text-text-secondary space-y-2">
            <li>Detect and prevent fraudulent activity or abuse</li>
            <li>Ensure compliance with applicable laws and regulations</li>
            <li>Enforce our Terms of Service</li>
          </ul>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Data Retention</h2>
        <p className="text-text-secondary mb-4">
          We retain your data for as long as necessary to provide our services and fulfill the purposes described in this policy:
        </p>
        <ul className="list-disc pl-5 text-text-secondary space-y-2">
          <li><strong>Account Data:</strong> Retained until you delete your account or request deletion.</li>
          <li><strong>Content You Create:</strong> Projects, goals, actions, and journal entries are retained until you delete them or delete your account.</li>
          <li><strong>Usage Logs:</strong> Retained for up to 90 days for security and debugging purposes, then automatically deleted.</li>
          <li><strong>Integration Data:</strong> Google Calendar events are cached for up to 15 minutes. Imported contacts are retained until you delete them.</li>
          <li><strong>Backups:</strong> Database backups containing your data are retained for up to 30 days.</li>
        </ul>
        <p className="text-text-secondary mt-4">
          When you request account deletion, we will remove your personal data within 30 days, except where retention is required by law or for legitimate business purposes (such as fraud prevention).
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Data Sharing</h2>
        <p className="text-text-secondary mb-4">
          We do not sell, rent, or trade your personal data. We only share your information in the following limited circumstances:
        </p>
        <ul className="list-disc pl-5 text-text-secondary space-y-2">
          <li><strong>Service Providers:</strong> We use trusted third-party services (Vercel for hosting, Railway for database) to operate our platform. These providers only have access to data necessary to perform their services and are bound by data protection agreements.</li>
          <li><strong>Legal Requirements:</strong> We may disclose data if required by law, court order, or government request.</li>
          <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your data may be transferred as part of that transaction. We will notify you of any such change.</li>
          <li><strong>With Your Consent:</strong> We may share data with third parties when you explicitly authorize us to do so.</li>
        </ul>
        <p className="text-text-secondary mt-4">
          We use industry-standard security measures including encryption at rest and in transit to safeguard your information.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Your Rights</h2>
        <p className="text-text-secondary mb-4">
          You have the right to:
        </p>
        <ul className="list-disc pl-5 text-text-secondary space-y-2">
          <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
          <li><strong>Correction:</strong> Request correction of inaccurate personal data.</li>
          <li><strong>Deletion:</strong> Request deletion of your personal data and account.</li>
          <li><strong>Data Portability:</strong> Request your data in a portable format.</li>
          <li><strong>Withdraw Consent:</strong> Disconnect third-party integrations at any time.</li>
        </ul>
        <p className="text-text-secondary mt-4">
          To exercise any of these rights, please contact us at{' '}
          <a href="mailto:privacy@exponential.im" className="text-brand-primary hover:underline">
            privacy@exponential.im
          </a>.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Contact</h2>
        <p className="text-text-secondary">
          If you have any questions or concerns regarding this Privacy Policy, please contact us at{' '}
          <a
            href="mailto:privacy@exponential.im"
            className="text-brand-primary hover:underline"
          >
            privacy@exponential.im
          </a>
        </p>
      </section>
    </div>
  );
} 