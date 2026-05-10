"use client";

import { useEffect, useState, useRef } from "react";
import { useSupabase } from "@/lib/use-supabase"; // supabase client
import type { Client } from "@/lib/types";
// passing whole client object (supabase)
interface Messages {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

type ChatBoxProps = {
  clientId: string;
  coachId: string;
  client: Client;
  open: boolean;
  onClose: () => void;
};

// get Current user
// I need supabase client
export default function ChatBox({
  clientId,
  open,
  onClose,
  client,
}: ChatBoxProps) {
  const supabase = useSupabase(); // state - some that persist (value that persis on component render) /// component -> fragment of jsx/tsx logic for it
  const [conversationId, setConversationId] = useState<string | null>(null); // array destructing 1. the current value 2. setter function
  const [isMinimized, setIsMinimized] = useState(false); // const -> variable can't be reassigned
  const minimize = () => setIsMinimized(!isMinimized); // set it to true //                creates state/ <> generic(typescript syntax) /[] array of messages
  const [messages, setMessages] = useState<Messages[]>([]); //empty array because no messages are loaded.
  const [messageText, setMessageText] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // messages = loop through messages to display chat bubbles in UI
  // setMessages(function) = call this after fetching from Supabase to store results
  // flow
  // fetch from Supabase -> get array of messages -> setMessages(data) -> messages now has data
  // -> render them on screen.
  const setupRan = useRef(false);
  useEffect(() => {
    // run on component mount and/or dependency change
    const setupConversation = async () => {
      // get current user
      if (setupRan.current) return;
      setupRan.current = true;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // find existing conversation
      let conversationId: string;
      const { data: existingConversation } = await supabase
        .from("conversations")
        .select("*")
        .eq("coach_id", user.id)
        .eq("client_id", clientId)
        .maybeSingle();

      if (existingConversation) {
        conversationId = existingConversation.id;
      } else {
        const { data: newConversation, error } = await supabase
          .from("conversations")
          .insert({ coach_id: user.id, client_id: clientId })
          .select()
          .single();

        if (error) {
          console.error("error creating convo:", error);
          return;
        }
        conversationId = newConversation.id;
      }

      // save to state
      // renders (unmounted) state will go away if we unmount
      setConversationId(conversationId);
      setCurrentUserId(user.id); // from line 57 user object, currentUserId = state variable.
      fetchMessages(conversationId);
    };
    setupConversation();
  }, [clientId]); // dependency array (if this change, useEffect will run again)
  const fetchMessages = async (convId: string) => {
    const { data } = await supabase // wait here until supabase responds then continues.
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    setMessages(data || []);
  };
  const sendMessage = async () => {
    // check if messageText is empty or conversationId is null.
    if (!messageText || !conversationId) return;
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      content: messageText,
    });
    setMessageText("");
    fetchMessages(conversationId as string);
  };
  return open ? (
    <div
      className={`fixed bottom-4 border right-4 w-80 z-50 ${isMinimized ? "h-auto" : "h-96"} bg-white rounded-lg shadow-lg`}
    >
      {/*header div: it needs name and close/minimize button*/}
      <div className="justify-between flex border-b bg-gray-100">
        <span>{client.full_name}</span>
        <div className="flex">
          <button
            onClick={minimize}
            className="px-2 py-0.5 rounded hover:bg-gray-200 text-gray-500"
          >
            _
          </button>
          <button
            className="px-2 py-0.5 rounded hover:bg-gray-200 text-gray-500"
            onClick={onClose}
          >
            x
          </button>
        </div>
      </div>
      {!isMinimized && (
        <div className="p-2 overflow-y-auto flex-1">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex mb-1 ${
                message.sender_id === currentUserId
                  ? "justify-end"
                  : "justify-start"
              }`}
            >
              <div
                className={`px-3 py-1 rounded-full text-sm max-w-xs ${
                  message.sender_id === currentUserId
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-900"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}
          {""}
        </div>
      )}
      {/* input area + send button*/}
      {!isMinimized && (
        <div className="absolute bottom-1 left-1 right-1 flex gap-1">
          <input
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            className="flex-1 p-1 border rounded-full px-1 py-0.5"
            placeholder="Aa"
          />
          <button
            onClick={sendMessage}
            className="px-3 py-1 bg-blue-600 text-white rounded-full text-sm"
          >
            send
          </button>
        </div>
      )}
    </div>
  ) : null;

  {
    /* onClose function from ClientDetailView gets called, sets setOpen to false */
  }
}
