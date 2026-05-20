'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './WhatsAppInbox.module.css';

interface Message {
  id: string;
  sender: string;
  recipient: string;
  message_content: string;
  direction: 'Inbound' | 'Outbound';
  created_at: string;
}

interface Contact {
  phone: string;
  name: string;
  companyName: string;
  companyId: string;
}

export default function WhatsAppInbox() {
  const supabase = createClient();
  const [contacts, setContacts] = useState<Contact[]>([
    {
      phone: '+971 50 123 4567',
      name: 'Youssef Al-Rashid',
      companyName: 'Al-Rashid Foodstuff LLC',
      companyId: 'c0f0a884-c812-4d2d-8bde-d51352e463a1'
    },
    {
      phone: '+971 6 555 7890',
      name: 'Amit Sharma',
      companyName: 'Gulf Spices & Seeds Industry',
      companyId: 'c0f0a884-c812-4d2d-8bde-d51352e463a2'
    }
  ]);
  
  const [selectedContact, setSelectedContact] = useState<Contact>(contacts[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [simulatedInbound, setSimulatedInbound] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch messages from Supabase
  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('outreach_threads')
        .select('*')
        .eq('channel', 'WhatsApp')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  useEffect(() => {
    fetchMessages();

    // Set up realtime subscription to refresh when new messages are added
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'outreach_threads' },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/outreach/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: 'd3b07384-d113-4e4e-9c8e-5b123d456789',
          company_id: selectedContact.companyId,
          recipient: selectedContact.phone,
          message_content: newMessage
        })
      });

      if (!response.ok) {
        throw new Error('Failed to dispatch Twilio WhatsApp message via server route');
      }

      setNewMessage('');
      fetchMessages();
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setLoading(false);
    }
  };

  // Triggers simulated message received on webhook
  const handleSimulateInbound = async () => {
    if (!simulatedInbound.trim()) return;

    try {
      const response = await fetch('/api/webhooks/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          From: `whatsapp:${selectedContact.phone}`,
          To: 'whatsapp:+14155238886',
          Body: simulatedInbound
        })
      });

      if (response.ok) {
        setSimulatedInbound('');
        fetchMessages();
      } else {
        console.error('Simulation webhook failed');
      }
    } catch (err) {
      console.error('Error simulating message:', err);
    }
  };

  // Filter messages for current contact
  const currentChatMessages = messages.filter(msg => {
    const contactPhoneClean = selectedContact.phone.replace(/[\s\-\+]/g, '');
    const msgSenderClean = msg.sender.replace(/whatsapp:/, '').replace(/[\s\-\+]/g, '');
    const msgRecipientClean = msg.recipient.replace(/whatsapp:/, '').replace(/[\s\-\+]/g, '');

    return msg.direction === 'Inbound' 
      ? msgSenderClean.includes(contactPhoneClean) || contactPhoneClean.includes(msgSenderClean)
      : msgRecipientClean.includes(contactPhoneClean) || contactPhoneClean.includes(msgRecipientClean);
  });

  return (
    <div className={styles.container}>
      {/* Sidebar: Contacts */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h3>Active Threads</h3>
          <span className={styles.activeBadge}>2 Online</span>
        </div>
        <div className={styles.contactList}>
          {contacts.map((contact) => (
            <button
              key={contact.phone}
              className={`${styles.contactItem} ${selectedContact.phone === contact.phone ? styles.activeContact : ''}`}
              onClick={() => setSelectedContact(contact)}
            >
              <div className={styles.avatar}>
                {contact.name.charAt(0)}
              </div>
              <div className={styles.contactInfo}>
                <div className={styles.contactName}>{contact.name}</div>
                <div className={styles.contactComp}>{contact.companyName}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Panel */}
      <div className={styles.chatArea}>
        <div className={styles.chatHeader}>
          <div>
            <h4>{selectedContact.name}</h4>
            <p className={styles.subtext}>{selectedContact.companyName} • {selectedContact.phone}</p>
          </div>
          <div className={styles.statusIndicator}>
            <span className={styles.dot}></span> Verified WhatsApp Sandbox
          </div>
        </div>

        {/* Message stream */}
        <div className={styles.messageStream}>
          {currentChatMessages.length === 0 ? (
            <div className={styles.emptyChat}>
              <p>No messages yet. Send a message to start the trade negotiation.</p>
            </div>
          ) : (
            currentChatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.messageBubble} ${
                  msg.direction === 'Outbound' ? styles.outbound : styles.inbound
                }`}
              >
                <div className={styles.messageContent}>{msg.message_content}</div>
                <span className={styles.timestamp}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input box */}
        <form onSubmit={handleSend} className={styles.inputArea}>
          <input
            type="text"
            placeholder={`Type a WhatsApp message to ${selectedContact.name}...`}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={loading}
            className={styles.input}
          />
          <button type="submit" className={styles.sendButton} disabled={loading || !newMessage.trim()}>
            Send Message
          </button>
        </form>
      </div>

      {/* Simulator Panel (Side panel for easy testing) */}
      <div className={styles.simulatorPanel}>
        <div className={styles.simHeader}>
          <h4>Inbound Webhook Simulator</h4>
          <p>Simulate customer replies hitting your Twilio webhook handler.</p>
        </div>
        <div className={styles.simBody}>
          <label className={styles.label}>Reply as {selectedContact.name}:</label>
          <textarea
            className={styles.simTextarea}
            placeholder='e.g., "Yes, we agree to CIF Jebel Ali terms. Please send the contract draft."'
            value={simulatedInbound}
            onChange={(e) => setSimulatedInbound(e.target.value)}
          />
          <button
            type="button"
            className={styles.simButton}
            onClick={handleSimulateInbound}
            disabled={!simulatedInbound.trim()}
          >
            Simulate Inbound Message
          </button>
        </div>
      </div>
    </div>
  );
}
