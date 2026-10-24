import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { promises as dns } from 'node:dns';

const BUILTIN_DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  'anonbox.net',
  'bccto.me',
  'burnermail.io',
  'chacuo.net',
  'Cock.li'.toLowerCase(),
  'crazymailing.com',
  'deadaddress.com',
  'Discard.email'.toLowerCase(),
  'discardmail.com',
  'dispostable.com',
  'dodgeit.com',
  'dodgit.com',
  'dropmail.me',
  'dumpmail.de',
  'e4ward.com',
  'emailondeck.com',
  'emailtemporanea.com',
  'emailtemporario.com.br',
  'ephemail.net',
  'fakeinbox.com',
  'fakemail.fr',
  'fakemailgenerator.com',
  'Fastacura.com'.toLowerCase(),
  'filzmail.com',
  'getairmail.com',
  'getnada.com',
  'gishpuppy.com',
  'grr.la',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'harakirimail.com',
  'hmamail.com',
  'incognitomail.org',
  'inboxalias.com',
  'inboxclean.com',
  'inboxkitten.com',
  'jetable.org',
  'kasmail.com',
  'koszmail.pl',
  'kurzepost.de',
  'letthemeatspam.com',
  'linshi-email.com',
  'lroid.com',
  'mail-temp.com',
  'mailblocks.com',
  'mailcatch.com',
  'mailde.de',
  'maildrop.cc',
  'maileater.com',
  'mailexpire.com',
  'mailforspam.com',
  'mailfreeonline.com',
  'mailin8r.com',
  'mailinater.com',
  'mailinator.com',
  'mailinator.net',
  'mailinator.org',
  'mailinator2.com',
  'mailincubator.com',
  'mailismagic.com',
  'mailmate.com',
  'mailme.ir',
  'mailme.lv',
  'mailmetrash.com',
  'mailmoat.com',
  'mailnator.com',
  'mailnesia.com',
  'mailnull.com',
  'mailpoof.com',
  'mailSac.com'.toLowerCase(),
  'mailscrap.com',
  'mailshell.com',
  'mailsiphon.com',
  'mailslapping.com',
  'mailslite.com',
  'mailtemp.info',
  'mailtothis.com',
  'mailzilla.com',
  'mbx.cc',
  'mega.zik.dj',
  'meltmail.com',
  'messagebeamer.de',
  'mintemail.com',
  'mohmal.com',
  'mohmal.im',
  'mohmal.in',
  'mohmal.tech',
  'mt2015.com',
  'mycleaninbox.net',
  'mypartyclip.de',
  'myphantomemail.com',
  'myspaceinc.com',
  'mytemp.email',
  'mytempemail.com',
  'mytrashmail.com',
  'neomailbox.com',
  'nepwk.com',
  'nervmich.net',
  'nervtmich.net',
  'netmails.com',
  'netmails.net',
  'netzidiot.de',
  'neverbox.com',
  'no-spam.ws',
  'nobulk.com',
  'noclickemail.com',
  'nogmailspam.info',
  'nomail.xl.cx',
  'nomail2me.com',
  'nomorespamemails.com',
  'nospam.ze.tc',
  'nospam4.us',
  'nospamfor.us',
  'nospamthanks.info',
  'notmailinator.com',
  'nowmymail.com',
  'nurfuerspam.de',
  'nus.edu.sg.temp',
  'nwldx.com',
  'objectmail.com',
  'obobbo.com',
  'oneoffemail.com',
  'onewaymail.com',
  'online.ms',
  'oopi.org',
  'ordinaryamerican.net',
  'otherinbox.com',
  'ourklips.com',
  'outlawspam.com',
  'ovpn.to',
  'owlpic.com',
  'pancakemail.com',
  'pimpedupmyspace.com',
  'pjjkp.com',
  'politikerclub.de',
  'poofy.org',
  'pookmail.com',
  'privacy.net',
  'proxymail.eu',
  'prtnx.com',
  'punkass.com',
  'putthisinyourspamdatabase.com',
  'qq.com.temp',
  'quickinbox.com',
  'rcpt.at',
  'reallymymail.com',
  'recode.me',
  'recursor.net',
  'regbypass.com',
  'rejectmail.com',
  'rhyta.com',
  'rklips.com',
  'rmqkr.net',
  'royal.net',
  'rppkn.com',
  'rtrtr.com',
  's0ny.net',
  'safe-mail.net',
  'safersignup.de',
  'safetymail.info',
  'safetypost.de',
  'sandelf.de',
  'saynotospams.com',
  'selfdestructingmail.com',
  'sendspamhere.com',
  'sharklasers.com',
  'shiftmail.com',
  'shitmail.me',
  'shortmail.net',
  'sibmail.com',
  'skeefmail.com',
  'slaskpost.se',
  'slopsbox.com',
  'smellfear.com',
  'snakemail.com',
  'sneakemail.com',
  'sofimail.com',
  'sofort-mail.de',
  'sogetthis.com',
  'soodonims.com',
  'spam.la',
  'spam.su',
  'spam4.me',
  'spamavert.com',
  'spambob.com',
  'spambob.net',
  'spambob.org',
  'spambog.com',
  'spambog.de',
  'spambog.ru',
  'spambox.info',
  'spambox.irishspringrealty.com',
  'spambox.us',
  'spamcannon.com',
  'spamcannon.net',
  'spamcero.com',
  'spamcon.org',
  'spamcorptastic.com',
  'spamcowboy.com',
  'spamcowboy.net',
  'spamcowboy.org',
  'spamday.com',
  'spambob.com',
  'spameater.com',
  'spameater.org',
  'spamex.com',
  'spamfree24.com',
  'spamfree24.de',
  'spamfree24.eu',
  'spamfree24.info',
  'spamfree24.net',
  'spamfree24.org',
  'spamgourmet.com',
  'spamgourmet.net',
  'spamgourmet.org',
  'spamherelots.com',
  'spamhereplease.com',
  'spamhole.com',
  'spamify.com',
  'spaminator.de',
  'spamkill.info',
  'spaml.com',
  'spaml.de',
  'spammotel.com',
  'spamobox.com',
  'spamoff.de',
  'spamslicer.com',
  'spamspot.com',
  'spamthis.co.uk',
  'spamthisplease.com',
  'spamtrail.com',
  'speed.1s.fr',
  'supergreatmail.com',
  'supermailer.jp',
  'suremail.info',
  'teewars.org',
  'teleworm.com',
  'teleworm.us',
  'temp-mail.com',
  'temp-mail.de',
  'temp-mail.org',
  'temp-mail.ru',
  'tempail.com',
  'tempalias.com',
  'tempe-mail.com',
  'tempemail.biz',
  'tempemail.co.za',
  'tempemail.com',
  'tempemail.net',
  'tempinbox.co.uk',
  'tempinbox.com',
  'tempmail.co',
  'tempmail.com',
  'tempmail.de',
  'tempmail.eu',
  'tempmail.it',
  'tempmail.net',
  'tempmail.us',
  'tempmail2.com',
  'tempmaildemo.com',
  'tempmailer.com',
  'tempmailer.de',
  'tempmailo.com',
  'tempomail.fr',
  'temporarily.de',
  'temporarioemail.com.br',
  'temporaryemail.net',
  'temporaryemail.us',
  'temporaryforwarding.com',
  'temporaryinbox.com',
  'temporarymailaddress.com',
  'thanksnospam.info',
  'thankyou2010.com',
  'thisisnotmyrealemail.com',
  'throwawayemailaddress.com',
  'throwawaymail.com',
  'tilien.com',
  'tmailinator.com',
  'tradermail.info',
  'trash-amil.com',
  'trash-mail.at',
  'trash-mail.com',
  'trash-mail.de',
  'trash2009.com',
  'trashemail.de',
  'trashmail.at',
  'trashmail.com',
  'trashmail.de',
  'trashmail.me',
  'trashmail.net',
  'trashmail.org',
  'trashmail.ws',
  'trashmailer.com',
  'trashymail.com',
  'trashymail.net',
  'trbvm.com',
  'turual.com',
  'twinmail.de',
  'uggsrock.com',
  'upliftnow.com',
  'uplipht.com',
  'venompen.com',
  'veryrealemail.com',
  'viditag.com',
  'viewcastmedia.com',
  'viewcastmedia.net',
  'viewcastmedia.org',
  'webm4il.info',
  'wegwerfadresse.de',
  'wegwerfemail.com',
  'wegwerfemail.de',
  'wegwerfmail.de',
  'wegwerfmail.info',
  'wegwerfmail.net',
  'wegwerfmail.org',
  'wetrainbayarea.com',
  'wetrainbayarea.org',
  'wh4f.org',
  'whyspam.me',
  'willselfdestruct.com',
  'winemaven.info',
  'wronghead.com',
  'wuzup.net',
  'wuzupmail.net',
  'wwwnew.eu',
  'xagloo.com',
  'xemaps.com',
  'xents.com',
  'xmaily.com',
  'xoxy.net',
  'yep.it',
  'yogamaven.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'ypmail.webarnak.fr.eu.org',
  'yuurok.com',
  'zehnminutenmail.de',
  'zippymail.info',
  'zoaxe.com',
  'zoemail.org',
]);

const SAFE_TEST_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'localhost',
]);

const MX_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class EmailVerifierService {
  private readonly logger = new Logger(EmailVerifierService.name);
  private readonly mxCache = new Map<
    string,
    { valid: boolean; expiresAt: number }
  >();

  isDisposableDomain(domain: string): boolean {
    const normalized = domain.trim().toLowerCase();
    if (!normalized) return true;

    const customList = (process.env.DISPOSABLE_EMAIL_DOMAINS || '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

    for (const blocked of customList) {
      if (normalized === blocked || normalized.endsWith(`.${blocked}`)) {
        return true;
      }
    }

    if (BUILTIN_DISPOSABLE_DOMAINS.has(normalized)) {
      return true;
    }

    const parts = normalized.split('.');
    for (let i = 1; i < parts.length - 1; i += 1) {
      const parentDomain = parts.slice(i).join('.');
      if (BUILTIN_DISPOSABLE_DOMAINS.has(parentDomain)) {
        return true;
      }
    }

    return false;
  }

  async hasValidMailServer(domain: string): Promise<boolean> {
    const normalized = domain.trim().toLowerCase();
    if (!normalized || !normalized.includes('.')) {
      return false;
    }

    if (
      (process.env.NODE_ENV === 'test' ||
        process.env.SKIP_EMAIL_MX_CHECK === 'true') &&
      SAFE_TEST_DOMAINS.has(normalized)
    ) {
      return true;
    }

    if (process.env.SKIP_EMAIL_MX_CHECK === 'true') {
      return true;
    }

    const now = Date.now();
    const cached = this.mxCache.get(normalized);
    if (cached && cached.expiresAt > now) {
      return cached.valid;
    }

    try {
      const mxRecords = await dns.resolveMx(normalized);
      const hasValidMx =
        Array.isArray(mxRecords) &&
        mxRecords.length > 0 &&
        mxRecords.some(
          (record) =>
            Boolean(record.exchange) &&
            record.exchange !== '.' &&
            record.exchange.trim() !== '',
        );

      this.mxCache.set(normalized, {
        valid: hasValidMx,
        expiresAt: now + MX_CACHE_TTL_MS,
      });
      return hasValidMx;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ENODATA' || code === 'ENOTIMP') {
        try {
          const aRecords = await dns.resolve4(normalized);
          const valid = Array.isArray(aRecords) && aRecords.length > 0;
          this.mxCache.set(normalized, {
            valid,
            expiresAt: now + MX_CACHE_TTL_MS,
          });
          return valid;
        } catch {
          this.mxCache.set(normalized, {
            valid: false,
            expiresAt: now + 5 * 60 * 1000,
          });
          return false;
        }
      }

      if (code === 'ENOTFOUND' || code === 'EBADNAME') {
        this.mxCache.set(normalized, {
          valid: false,
          expiresAt: now + 5 * 60 * 1000,
        });
        return false;
      }

      // If local container DNS is temporarily unreachable (ETIMEOUT / EAI_AGAIN), log a warning and do not falsely block real users
      this.logger.warn(
        `DNS MX lookup warning for domain "${normalized}" (${code || 'unknown'}): allowing fallback to OTP verification`,
      );
      return true;
    }
  }

  async validateEmailAddress(email: string): Promise<void> {
    const trimmed = email.trim().toLowerCase();
    const atIndex = trimmed.lastIndexOf('@');
    if (atIndex <= 0 || atIndex === trimmed.length - 1) {
      throw new BadRequestException('Invalid email address format');
    }

    const localPart = trimmed.slice(0, atIndex);
    const domain = trimmed.slice(atIndex + 1);

    if (
      localPart.length > 64 ||
      domain.length > 253 ||
      domain.startsWith('.') ||
      domain.endsWith('.') ||
      domain.includes('..')
    ) {
      throw new BadRequestException('Invalid email address format');
    }

    if (this.isDisposableDomain(domain)) {
      throw new BadRequestException(
        'Disposable or temporary email addresses are not allowed. Please use a real email address.',
      );
    }

    const hasMailServer = await this.hasValidMailServer(domain);
    if (!hasMailServer) {
      throw new BadRequestException(
        'Email domain does not exist or cannot receive mail. Please check your email address.',
      );
    }
  }
}

