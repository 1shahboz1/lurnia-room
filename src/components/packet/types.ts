export type PacketType = {
  id: string
  label: string
  desc?: string
  color?: string // Tailwind classes for bg/text
}

export type PacketTypeGroup = {
  id: string
  title: string
  icon?: string
  items: PacketType[]
}

export const PACKET_TYPE_GROUPS: PacketTypeGroup[] = [
  {
    id: 'app',
    title: '🌐 Application Layer',
    items: [
      { id: 'HTTP_REQUEST', label: 'HTTP_REQUEST', desc: 'HTTP request', color: 'bg-sky-50 text-sky-600' },
      { id: 'HTTP_RESPONSE', label: 'HTTP_RESPONSE', desc: 'HTTP response', color: 'bg-teal-50 text-teal-600' },
      { id: 'DNS_QUERY', label: 'DNS_QUERY', desc: 'DNS query', color: 'bg-yellow-50 text-yellow-700' },
      { id: 'DNS_RESPONSE', label: 'DNS_RESPONSE', desc: 'DNS response', color: 'bg-yellow-50 text-yellow-700' },
      { id: 'TLS_CLIENT_HELLO', label: 'TLS_CLIENT_HELLO', desc: 'TLS client hello', color: 'bg-purple-50 text-purple-700' },
      { id: 'TLS_SERVER_HELLO', label: 'TLS_SERVER_HELLO', desc: 'TLS server hello', color: 'bg-purple-50 text-purple-700' },
      { id: 'TLS_CERT', label: 'TLS_CERT', desc: 'TLS certificate', color: 'bg-purple-50 text-purple-700' },
      { id: 'SMTP_MAIL', label: 'SMTP_MAIL', desc: 'SMTP mail', color: 'bg-amber-50 text-amber-700' },
      { id: 'FTP_COMMAND', label: 'FTP_COMMAND', desc: 'FTP command', color: 'bg-amber-50 text-amber-700' },
      { id: 'SSH_HANDSHAKE', label: 'SSH_HANDSHAKE', desc: 'SSH handshake', color: 'bg-slate-50 text-slate-700' },
      { id: 'PKI_CERT_REQUEST', label: 'PKI_CERT_REQUEST', desc: 'PKI cert request', color: 'bg-slate-50 text-slate-700' },
      { id: 'PKI_CERT_RESPONSE', label: 'PKI_CERT_RESPONSE', desc: 'PKI cert response', color: 'bg-slate-50 text-slate-700' },
    ],
  },
  {
    id: 'transport',
    title: '🔒 Transport Layer',
    items: [
      { id: 'TCP_SYN', label: 'TCP_SYN', desc: 'SYN', color: 'bg-pink-50 text-pink-700' },
      { id: 'TCP_SYNACK', label: 'TCP_SYNACK', desc: 'SYN+ACK', color: 'bg-pink-50 text-pink-700' },
      { id: 'TCP_ACK', label: 'TCP_ACK', desc: 'ACK', color: 'bg-pink-50 text-pink-700' },
      { id: 'TCP_RST', label: 'TCP_RST', desc: 'RST', color: 'bg-rose-50 text-rose-700' },
      { id: 'TCP_FIN', label: 'TCP_FIN', desc: 'FIN', color: 'bg-rose-50 text-rose-700' },
      { id: 'UDP_DATAGRAM', label: 'UDP_DATAGRAM', desc: 'UDP datagram', color: 'bg-indigo-50 text-indigo-700' },
    ],
  },
  {
    id: 'network',
    title: '🧱 Network Layer',
    items: [
      { id: 'ICMP_ECHO_REQUEST', label: 'ICMP_ECHO_REQUEST', desc: 'ICMP ping request', color: 'bg-slate-50 text-slate-700' },
      { id: 'ICMP_ECHO_REPLY', label: 'ICMP_ECHO_REPLY', desc: 'ICMP ping reply', color: 'bg-slate-50 text-slate-700' },
      { id: 'ARP_REQUEST', label: 'ARP_REQUEST', desc: 'ARP request', color: 'bg-slate-50 text-slate-700' },
      { id: 'ARP_REPLY', label: 'ARP_REPLY', desc: 'ARP reply', color: 'bg-slate-50 text-slate-700' },
      { id: 'BGP_UPDATE', label: 'BGP_UPDATE', desc: 'BGP update', color: 'bg-slate-50 text-slate-700' },
      { id: 'OSPF_HELLO', label: 'OSPF_HELLO', desc: 'OSPF hello', color: 'bg-slate-50 text-slate-700' },
      { id: 'DHCP_DISCOVER', label: 'DHCP_DISCOVER', desc: 'DHCP discover', color: 'bg-slate-50 text-slate-700' },
      { id: 'DHCP_OFFER', label: 'DHCP_OFFER', desc: 'DHCP offer', color: 'bg-slate-50 text-slate-700' },
    ],
  },
]