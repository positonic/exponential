'use client';

import React, { useState, useEffect } from 'react';
// Make sure to import the Silk type if available, otherwise adjust as needed
import { initSilk } from "@silk-wallet/silk-wallet-sdk";

interface HumanButtonProps {
  className?: string;
  size?: 'default' | 'small';
  // Callback function for successful login, passing the connected accounts
  onLoginSuccess?: (accounts: string[]) => void;
  // Callback function for login errors
  onLoginError?: (error: unknown) => void;
}

// Initialize Silk outside the component to avoid re-initialization on renders
// Ensure this runs only on the client-side
let silkInstance: ReturnType<typeof initSilk> | null = null;
if (typeof window !== 'undefined') {
  try {
    silkInstance = initSilk();
  } catch (error) {
    console.error("Failed to initialize Silk SDK:", error);
    // Handle initialization error appropriately, maybe disable the button
  }
}

export function HumanButton({
  className = '',
  size = 'default',
  onLoginSuccess,
  onLoginError
}: HumanButtonProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Effect to set isMounted after component mounts on client
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Add logging here
  console.log("HumanButton Render:", {
    isSilkInitialized: !!silkInstance,
    isLoading,
    isLoggedIn,
  });

  // Optional: You might want a way to check if the user is already logged in
  // when the component mounts, if the SDK provides a non-interactive way.
  // Example (adjust based on actual Silk SDK capabilities):
  // useEffect(() => {
  //   const checkInitialLogin = async () => {
  //     if (!silkInstance) return;
  //     try {
  //       // Assuming 'eth_accounts' returns accounts if already connected without prompt
  //       const initialAccounts = await silkInstance.request({ method: 'eth_accounts' });
  //       if (initialAccounts && initialAccounts.length > 0) {
  //         setIsLoggedIn(true);
  //         setAccounts(initialAccounts);
  //         if (onLoginSuccess) onLoginSuccess(initialAccounts);
  //       }
  //     } catch (error) {
  //       console.warn("Could not check initial Silk login status:", error);
  //     }
  //   };
  //   checkInitialLogin();
  // }, [onLoginSuccess]); // Dependency array includes callback

  const handleLogin = async () => {
    console.log("handleLogin: Attempting login..."); // Log start
    // Ensure SDK is initialized and not already logged in or loading
    if (!silkInstance) {
      const error = new Error("Silk SDK not initialized.");
      console.error("handleLogin Error:", error);
      if (onLoginError) onLoginError(error);
      return;
    }
    if (isLoggedIn || isLoading) {
        console.log("handleLogin: Already logged in or loading, exiting.", {isLoggedIn, isLoading}); // Log exit condition
        return;
    }

    setIsLoading(true);
    console.log("handleLogin: Set isLoading=true"); // Log state change
    try {
      // Trigger the Silk login modal
      console.log("handleLogin: Calling silkInstance.login()..."); // Log before await
      await silkInstance.login();
      console.log("handleLogin: silkInstance.login() completed."); // Log after await

      // If login succeeds, request accounts
      console.log("handleLogin: Calling silkInstance.request accounts..."); // Log before await
      const currentAccountsResult = await silkInstance.request({ method: 'eth_requestAccounts' });
      console.log("handleLogin: Accounts received:", currentAccountsResult); // Log result
      
      // --- Type Check/Assertion ---
      if (!Array.isArray(currentAccountsResult) || !currentAccountsResult.every(item => typeof item === 'string')) {
        throw new Error("Received invalid accounts format from Silk SDK");
      }
      const currentAccounts: string[] = currentAccountsResult;
      // --- End Type Check ---

      // Update state
      setIsLoggedIn(true);
      setAccounts(currentAccounts);
      console.log("handleLogin: Set isLoggedIn=true, accounts updated."); // Log state change

      // Trigger success callback
      if (onLoginSuccess) {
        console.log("handleLogin: Calling onLoginSuccess callback."); // Log callback call
        onLoginSuccess(currentAccounts);
      }
    } catch (error) {
      console.error("handleLogin Error in try/catch:", error);
      setIsLoggedIn(false); // Ensure logged out state on error
      setAccounts([]);
      // Trigger error callback
      if (onLoginError) {
        console.log("handleLogin: Calling onLoginError callback."); // Log callback call
        onLoginError(error);
      }
    } finally {
      // Ensure loading state is reset
      setIsLoading(false);
      console.log("handleLogin: Set isLoading=false in finally block."); // Log state change
    }
  };

  // Calculate padding and text size based on the size prop
  const sizeClasses = size === 'small'
    ? 'px-5 py-2 text-sm'
    : 'px-6 py-3 text-base';

  // Don't render the button until mounted on the client
  if (!isMounted) {
    // Render a placeholder or null on the server and initial client render
    // to match the server output initially.
    // A simple button with default text and permanently disabled state is safe.
    return (
      <button
        disabled={true}
        className={`${sizeClasses} font-semibold rounded-md flex items-center justify-center gap-2 transition-all text-white opacity-50 cursor-not-allowed ${className}`}
        style={{ 
          background: 'linear-gradient(90deg, #8B5CF6 0%, #3B82F6 100%)'
        }}
      >
        Login with Silk
      </button>
    );
  }

  // Determine button text based on state (only runs when mounted)
  const buttonText = isLoading
    ? 'Connecting...'
    : isLoggedIn && accounts && accounts.length > 0 && accounts[0]
    ? `Connected: ${accounts[0].substring(0, 6)}...${accounts[0].substring(accounts[0].length - 4)}`
    : 'Login with Silk';

  // Render the actual button logic only after mounting
  return (
    <button
      onClick={handleLogin}
      disabled={!silkInstance || isLoading || isLoggedIn} // This logic now runs safely after mount
      className={`${sizeClasses} font-semibold rounded-md flex items-center justify-center gap-2 transition-all hover:shadow-lg hover:shadow-purple-500/20 text-white disabled:opacity-70 disabled:cursor-not-allowed ${className}`}
      style={{ 
        background: 'linear-gradient(90deg, #8B5CF6 0%, #3B82F6 100%)'
      }}
    >
      {buttonText}
    </button>
  );
}