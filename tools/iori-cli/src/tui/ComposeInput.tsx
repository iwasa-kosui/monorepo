import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import React, { useState } from 'react';

interface ComposeInputProps {
  onSubmit: (content: string) => void;
  onCancel: () => void;
}

export function ComposeInput({ onSubmit, onCancel }: ComposeInputProps): React.ReactElement {
  const [value, setValue] = useState('');

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  const handleSubmit = (text: string) => {
    const trimmed = text.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
  };

  return (
    <Box flexDirection='column' borderStyle='round' borderColor='cyan' paddingX={1}>
      <Text color='cyan' bold>投稿を入力:</Text>
      <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
    </Box>
  );
}
