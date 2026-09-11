import type { RdapDomain } from '@/lib/rdap/types';

/**
 * A trimmed but structurally faithful RDAP response, shaped like what Verisign
 * returns for a `.com` name: jCard contacts, event dates, DNSSEC delegation and
 * RFC 9537 redaction signalling.
 */
export const exampleComRdap: RdapDomain = {
  objectClassName: 'domain',
  handle: '2336799_DOMAIN_COM-VRSN',
  ldhName: 'EXAMPLE.COM',
  status: ['client delete prohibited', 'clientTransferProhibited', 'active'],
  events: [
    { eventAction: 'registration', eventDate: '1995-08-14T04:00:00Z' },
    { eventAction: 'expiration', eventDate: '2026-08-13T04:00:00Z' },
    { eventAction: 'last changed', eventDate: '2025-08-14T07:01:34Z' },
    { eventAction: 'last update of RDAP database', eventDate: '2026-09-12T09:00:00Z' },
  ],
  nameservers: [
    {
      objectClassName: 'nameserver',
      ldhName: 'b.iana-servers.net',
      ipAddresses: { v4: ['199.43.133.53'], v6: ['2001:500:8d::53'] },
    },
    { objectClassName: 'nameserver', ldhName: 'A.IANA-SERVERS.NET' },
  ],
  secureDNS: {
    delegationSigned: true,
    dsData: [{ keyTag: 370, algorithm: 13, digestType: 2, digest: 'ABC123' }],
  },
  entities: [
    {
      objectClassName: 'entity',
      handle: '376',
      roles: ['registrar'],
      publicIds: [{ type: 'IANA Registrar ID', identifier: '376' }],
      links: [{ rel: 'about', href: 'https://res-dom.iana.org', type: 'text/html' }],
      vcardArray: [
        'vcard',
        [
          ['version', {}, 'text', '4.0'],
          ['fn', {}, 'text', 'RESERVED-Internet Assigned Numbers Authority'],
        ],
      ],
      entities: [
        {
          objectClassName: 'entity',
          roles: ['abuse'],
          vcardArray: [
            'vcard',
            [
              ['version', {}, 'text', '4.0'],
              ['fn', {}, 'text', 'Abuse Desk'],
              ['email', {}, 'text', 'abuse@example-registrar.test'],
              ['tel', { type: 'voice' }, 'uri', 'tel:+1.5555550100'],
            ],
          ],
        },
      ],
    },
    {
      objectClassName: 'entity',
      handle: 'REG-1',
      roles: ['registrant'],
      vcardArray: [
        'vcard',
        [
          ['version', {}, 'text', '4.0'],
          ['fn', {}, 'text', 'Example Holder'],
          ['org', {}, 'text', 'Example Organisation'],
          [
            'adr',
            { label: 'One Example Way\nLos Angeles\nCA' },
            'text',
            ['', '', '', '', '', '', ''],
          ],
        ],
      ],
      remarks: [
        {
          title: 'REDACTED FOR PRIVACY',
          description: ['Some of the data in this object has been removed.'],
        },
      ],
    },
  ],
  notices: [
    {
      title: 'Terms of Use',
      description: ['Service subject to Terms of Use.'],
    },
  ],
  redacted: [
    { name: { type: 'Registrant Email' }, method: 'emailRedaction' },
    { name: { description: 'Tech Phone' }, method: 'removal' },
  ],
};
