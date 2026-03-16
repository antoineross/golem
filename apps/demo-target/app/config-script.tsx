"use client";

interface ConfigScriptProps {
  config: {
    apiKey: string;
    debugMode: boolean;
    adminEmail: string;
  };
}

export function ConfigScript({ config }: ConfigScriptProps) {
  return (
    <script
      id="__APP_CONFIG__"
      type="application/json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          props: {
            config: {
              apiKey: config.apiKey,
              debugMode: config.debugMode,
              adminEmail: config.adminEmail,
            },
          },
        }),
      }}
    />
  );
}
