const nodeMailjet = require('node-mailjet');

// Lazy loading : la connexion Mailjet n'est créée que lors de la première utilisation
let mailjet = null;

function getMailjetClient() {
  if (!mailjet) {
    const apiKey = process.env.MAILJET_KEY_ACDLP;
    const apiSecret = process.env.MAILJET_SECRET_ACDLP;

    if (!apiKey || !apiSecret) {
      throw new Error('MAILJET_KEY_ACDLP and MAILJET_SECRET_ACDLP must be defined in environment variables');
    }
    
    mailjet = nodeMailjet.connect(apiKey, apiSecret);
  }
  return mailjet;
}

const sendTemplateEmail = async (to, templateId, variables, subject, replyTo, from, attachments) => {
  try {
    const client = getMailjetClient();
    console.log("Sujet de l'email : " + subject + " à " + to);
    console.log(variables);

    // Gérer replyTo de manière flexible (string ou objet)
    let replyToConfig = undefined;
    if (replyTo) {
      if (typeof replyTo === 'string') {
        // Rétrocompatible : simple email string
        replyToConfig = {
          Email: replyTo,
          Name: variables.asso || 'Association',
        };
      } else if (typeof replyTo === 'object' && replyTo.email) {
        // Nouvelle syntaxe : objet avec email et name
        replyToConfig = {
          Email: replyTo.email,
          Name: replyTo.name || variables.asso || 'Association',
        };
      }
    }

    const mailjetBody = {
      Messages: [
        {
          From: {
            Email: from || 'noreply@acdlp.com', // Remplace uniquement l'email si "from" est fourni
            Name: 'ACDLP',
          },
          To: [
            {
              Email: to,
              Name: variables.prenom || to.split('@')[0],
            },
          ],
          ReplyTo: replyToConfig,
          TemplateErrorReporting: {
            Email: 'rachidboulsane@gmail.com',
            Name: 'Rachid',
          },
          TemplateID: templateId,
          TemplateLanguage: true,
          Variables: variables,
          Subject: subject || 'No Subject',
        },
      ],
    };

    // Ajouter les pièces jointes si fournies
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      mailjetBody.Messages[0].Attachments = attachments;
      console.log(`[Mailjet] ${attachments.length} pièce(s) jointe(s) ajoutée(s)`);
    }

    console.log("[Mailjet Body]:", JSON.stringify(mailjetBody, null, 2));

    const request = client.post('send', { version: 'v3.1' }).request(mailjetBody);

    const response = await request;
    return response.body;
  } catch (error) {
    console.error(`[Mailjet Error]: ${error.message}`, error);
    throw new Error('Email sending failed');
  }
};

/**
 * Envoie un email simple (sans template)
 * Utilisé pour les notifications support
 */
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    console.log(`[Mailjet] Envoi email simple à ${to}`);

    const mailjetBody = {
      Messages: [
        {
          From: {
            Email: 'noreply@acdlp.com',
            Name: 'Support ACDLP',
          },
          To: [
            {
              Email: to,
              Name: to.split('@')[0],
            },
          ],
          Subject: subject || 'Message de ACDLP',
          HTMLPart: html,
          TextPart: text || '',
        },
      ],
    };

    const request = mailjet.post('send', { version: 'v3.1' }).request(mailjetBody);
    const response = await request;
    console.log(`[Mailjet] Email envoyé avec succès à ${to}`);
    return response.body;
  } catch (error) {
    console.error(`[Mailjet Error]: ${error.message}`, error);
    throw new Error('Email sending failed');
  }
};

module.exports = {
  sendTemplateEmail,
  sendEmail,
};
