// Test the slug to projectId extraction logic

const slug = "exponential-cmdddgwjl0000o5wp595s9t91";

console.log("Original slug:", slug);

// This is the logic from the page component
const projectId = slug.split('-').pop();

console.log("Extracted projectId:", projectId);
console.log("Expected projectId:  cmdddgwjl0000o5wp595s9t91");
console.log("Match?", projectId === "cmdddgwjl0000o5wp595s9t91");

// Let's also try different extraction methods
console.log("\n--- Alternative Methods ---");

// Method 1: Extract everything after the last dash (current method)
const method1 = slug.split('-').pop();
console.log("Method 1 (current):", method1);

// Method 2: Extract the cuid pattern (c followed by 25 chars)
const cuidMatch = slug.match(/c[a-z0-9]{25}/);
const method2 = cuidMatch ? cuidMatch[0] : null;
console.log("Method 2 (regex):", method2);

// Method 3: Find the first occurrence of 'c' followed by the cuid pattern
const method3 = slug.substring(slug.indexOf('c'));
console.log("Method 3 (substring):", method3);

// Let's check if the issue is that the slug format is different
console.log("\n--- Slug Analysis ---");
const parts = slug.split('-');
console.log("Slug parts:", parts);
console.log("Number of parts:", parts.length);
console.log("Last part:", parts[parts.length - 1]);
console.log("Second to last part:", parts[parts.length - 2]);

// Check if we need to combine multiple parts for the cuid
if (parts.length > 2) {
  const possibleId = parts.slice(1).join(''); // Remove first part, join the rest
  console.log("Possible full ID (no dashes):", possibleId);
}