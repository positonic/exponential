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
        <ul className="list-disc pl-5 text-text-secondary space-y-2">
          <li>
            <strong>Personal Information:</strong> Such as your name, email address, and any details you voluntarily provide.
          </li>
          <li>
            <strong>Usage Data:</strong> Information about how you interact with our service, including logs and cookies,
            to help us improve the service.
          </li>
          <li>
            <strong>Third-Party Integrations:</strong> Data from services you connect, such as Google (see detailed section below).
          </li>
        </ul>
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
        <h2 className="text-2xl font-semibold mb-4">How We Use Your Information</h2>
        <p className="text-text-secondary mb-4">We use your data to:</p>
        <ul className="list-disc pl-5 text-text-secondary space-y-2">
          <li>Provide, maintain, and improve our service</li>
          <li>Communicate important updates and promotions</li>
          <li>Ensure compliance with legal obligations</li>
          <li>Enhance user experience through analytics</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Data Sharing and Security</h2>
        <p className="text-text-secondary mb-4">
          We do not sell your personal data. We may share your information only with trusted third parties
          (such as our hosting providers) or as required by law. We use industry-standard security measures
          including encryption at rest and in transit to safeguard your information.
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