import { type Metadata } from "next";

export const metadata: Metadata = {
  title: 'Terms of Service | Exponential',
  description: 'Terms of Service for Exponential - Understanding your rights and responsibilities when using our service.',
};

export default function TermsOfUse() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8 text-text-primary">Terms of Service</h1>

      <p className="text-text-muted mb-8">Effective Date: January 3rd, 2026</p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-text-primary">1. Introduction</h2>
        <p className="text-text-secondary mb-4">
          Welcome to Exponential (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). Exponential is an AI-powered productivity
          and project management platform designed to help individuals and teams organize their work,
          set goals, track outcomes, and collaborate effectively. By accessing or using our service
          at exponential.im (the &quot;Service&quot;), you agree to be bound by these Terms of Service
          (&quot;Terms&quot;). Please read them carefully before using our Service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-text-primary">2. Acceptance of Terms</h2>
        <p className="text-text-secondary mb-4">
          By creating an account, accessing, or using the Service, you acknowledge that you have read,
          understood, and agree to be bound by these Terms and our Privacy Policy. If you are using the
          Service on behalf of an organization, you represent and warrant that you have the authority to
          bind that organization to these Terms. If you do not agree to these Terms, you must not access
          or use the Service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-text-primary">3. Account Registration</h2>
        <p className="text-text-secondary mb-4">
          To use certain features of the Service, you must create an account using a supported
          authentication provider (such as Google or Discord). You agree to:
        </p>
        <ul className="list-disc pl-5 text-text-secondary space-y-2">
          <li>Provide accurate and complete information when creating your account.</li>
          <li>Maintain the security of your account credentials and not share them with others.</li>
          <li>Notify us immediately of any unauthorized access to or use of your account.</li>
          <li>Accept responsibility for all activities that occur under your account.</li>
        </ul>
        <p className="text-text-secondary mt-4">
          We reserve the right to suspend or terminate accounts that violate these Terms or that
          we reasonably believe have been compromised.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-text-primary">4. Description of Service</h2>
        <p className="text-text-secondary mb-4">
          Exponential provides a suite of productivity and project management tools, including but not limited to:
        </p>
        <ul className="list-disc pl-5 text-text-secondary space-y-2">
          <li>Project and task management with priorities, statuses, and deadlines.</li>
          <li>Goal setting and outcome tracking aligned with strategic objectives.</li>
          <li>AI-powered assistance for task planning, content analysis, and workflow automation.</li>
          <li>Team collaboration through shared workspaces, projects, and reviews.</li>
          <li>Integrations with third-party services (Slack, Google Calendar, GitHub, and others).</li>
          <li>Journal, habit tracking, and personal productivity features.</li>
        </ul>
        <p className="text-text-secondary mt-4">
          We may add, modify, or discontinue features at any time. We will make reasonable efforts
          to notify users of significant changes to the Service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-text-primary">5. User Responsibilities</h2>
        <p className="text-text-secondary mb-4">When using the Service, you agree to:</p>
        <ul className="list-disc pl-5 text-text-secondary space-y-2">
          <li>Use the Service in compliance with all applicable laws and regulations.</li>
          <li>Not use the Service to store, transmit, or distribute any unlawful, harmful, or offensive content.</li>
          <li>Not attempt to gain unauthorized access to any part of the Service or its infrastructure.</li>
          <li>Not interfere with or disrupt the Service or servers or networks connected to the Service.</li>
          <li>Not reverse engineer, decompile, or disassemble any part of the Service.</li>
          <li>Not use automated means to access the Service except through our published APIs.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-text-primary">6. Your Content</h2>
        <p className="text-text-secondary mb-4">
          You retain ownership of all content you submit, post, or display through the Service
          (&quot;Your Content&quot;). By using the Service, you grant us a limited license to store, process,
          and display Your Content solely for the purpose of providing and improving the Service.
        </p>
        <p className="text-text-secondary mb-4">
          You are responsible for ensuring that Your Content does not violate any third-party rights
          or applicable laws. We do not monitor or endorse user content, but we reserve the right to
          remove content that violates these Terms.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-text-primary">7. AI Features</h2>
        <p className="text-text-secondary mb-4">
          The Service includes AI-powered features that may generate suggestions, summaries, or other
          content based on your input. You acknowledge that:
        </p>
        <ul className="list-disc pl-5 text-text-secondary space-y-2">
          <li>AI-generated content is provided for informational purposes and may not always be accurate.</li>
          <li>You are responsible for reviewing and verifying any AI-generated output before relying on it.</li>
          <li>Your inputs to AI features may be processed by third-party AI service providers in accordance with our Privacy Policy.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-text-primary">8. Intellectual Property</h2>
        <p className="text-text-secondary mb-4">
          All content, design, software, trademarks, and functionality provided through the Service are
          the property of Exponential or its licensors and are protected by intellectual property laws.
          You may not copy, modify, distribute, sell, or lease any part of the Service without our
          prior written consent. Unauthorized use, reproduction, or distribution is strictly prohibited.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-text-primary">9. Third-Party Integrations</h2>
        <p className="text-text-secondary mb-4">
          The Service may integrate with or link to third-party services and applications. Your use
          of such third-party services is subject to their own terms of service and privacy policies.
          We are not responsible for the content, functionality, or practices of any third-party services.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-text-primary">10. Termination</h2>
        <p className="text-text-secondary mb-4">
          You may stop using the Service and close your account at any time by contacting us.
          We may suspend or terminate your access to the Service at any time, with or without cause,
          and with or without notice. Upon termination, your right to use the Service will cease
          immediately. We may retain certain data as required by law or for legitimate business purposes.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-text-primary">11. Disclaimers and Limitations of Liability</h2>
        <p className="text-text-secondary mb-4">
          The Service is provided &quot;as is&quot; and &quot;as available&quot; without any warranties of any kind,
          whether express or implied, including but not limited to warranties of merchantability,
          fitness for a particular purpose, and non-infringement.
        </p>
        <p className="text-text-secondary mb-4">
          To the fullest extent permitted by law, Exponential shall not be liable for any indirect,
          incidental, special, consequential, or punitive damages, or any loss of profits, data,
          or goodwill, arising out of or in connection with your use of the Service, even if we have
          been advised of the possibility of such damages.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-text-primary">12. Governing Law</h2>
        <p className="text-text-secondary mb-4">
          These Terms are governed by and construed in accordance with the laws of Ireland, without
          regard to its conflict of law provisions. Any disputes arising under or in connection with
          these Terms shall be subject to the exclusive jurisdiction of the courts of Ireland.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-text-primary">13. Modifications to Terms</h2>
        <p className="text-text-secondary mb-4">
          We reserve the right to update or modify these Terms at any time. If we make material changes,
          we will notify you by posting the updated Terms on the Service and updating the effective date
          above. Your continued use of the Service after any changes constitutes your acceptance of the
          revised Terms. We encourage you to review these Terms periodically.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-text-primary">14. Contact</h2>
        <p className="text-text-secondary">
          If you have any questions or concerns regarding these Terms, please contact us at{' '}
          <a
            href="mailto:support@exponential.im"
            className="text-brand-primary hover:underline"
          >
            support@exponential.im
          </a>
        </p>
      </section>
    </div>
  );
}
