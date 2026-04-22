"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client"; // supabase client
// passing whole client object (supabase)
interface Client {
  id: string;
  full_name: string;
  email: string;
}
interface Messages {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

type ChatBoxProps = {
  clientId: string;
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
  const supabase = createClient();
  // state - some that persist (value that persis on component render)
  // component -> fragment of jsx/tsx logic for it
  const [conversationId, setConversationId] = useState<string | null>(null);
  // array destructing 1. the current value 2. setter function
  const [isMinimized, setIsMinimized] = useState(false); // const -> variable can't be reassigned
  const minimize = () => setIsMinimized(!isMinimized); // set it to true
  console.log("conversationId:", conversationId); // with state, never assign variable directly, use setter function
  // built in react hook that runs callback on mount
  // TODO: message                creates state/ <> generic(typescript syntax) /[] array of messages
  const [messages, setMessages] = useState<Messages[]>([]); //empty array because no messages are loaded.
  const [messageText, setMessageText] = useState("");
  // messages = loop through messages to display chat bubbles in UI
  // setMessages(function) = call this after fetching from Supabase to store results
  // flow
  // fetch from Supabase -> get array of messages -> setMessages(data) -> messages now has data
  // -> render them on screen.
  useEffect(() => {
    // run on component mount and/or dependency change
    const setupConversation = async () => {
      // get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // find existing conversation
      const { data: existingConversation } = await supabase
        .from("conversations")
        .select("*")
        .eq("coach_id", user.id)
        .eq("client_id", clientId)
        .maybeSingle(); // expects only 1 result and returns null if none

      let conversationId: string;

      // create if not exists
      if (existingConversation) {
        conversationId = existingConversation.id;
      } else {
        const { data: newConversation } = await supabase
          .from("conversations")
          .insert({
            coach_id: user.id,
            client_id: clientId,
          })
          .select()
          .single();

        conversationId = newConversation.id;
      }
      const fetchMessages = async () => {
        const { data } = await supabase // wait here until supabase responds then continues.
          .from("messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });
        setMessages(data || []);
      };
      // save to state
      // renders (unmounted) state will go away if we unmount
      setConversationId(conversationId);
      fetchMessages();
    };
    setupConversation();
  }, [clientId]); // dependency array (if this change, useEffect will run again)
  return open ? (
    <div
      className={`fixed bottom-4 right-4 w-80 z-50 ${isMinimized ? "h-auto" : "h-96"} bg-white rounded-lg shadow-lg`}
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
        <input
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          className="absolute bottom-0 left-0 right-0 p-1.5 w-full border rounded-full px-2 py-1"
          placeholder="Aa"
        ></input>
      )}
    </div>
  ) : null;
  {
    /* onClose function from ClientDetailView gets called, sets setOpen to false */
  }
}
