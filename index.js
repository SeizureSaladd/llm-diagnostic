import OpenAI from "openai";
import 'dotenv/config';
import fs from 'fs';

const openai = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
});

function base64_encode(file) {
    return `data:image/png;base64,${fs.readFileSync(file, 'base64')}`;
}

const FlowchartToJson = async(file) => {
  let image = base64_encode('images/' + file);
  let chatCompletion = await openai.chat.completions.create({
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'transcribe this flowchart into JSON. Label each node with a unique state number. Return only JSON. Example JSON: {"states": [{"id": 1, "type": "quesiton", "content": "question here", "yes": 2, "no": 3}]} etc. If the item in the flowchart isn\'t a question, label it as "action". Make sure to include every item in the flowchart other than the title and copyright. Also, if an item doesn\'t have a yes or no, label it as "action". If it leads to another item, add a "next" tag to it with the next item ID.'},
      {type: 'image_url', image_url: {"url": image}}
    ]}],
    model: 'gpt-4o',
  });

  let json = chatCompletion.choices[0].message.content;

  let regex = /\`{3}(\w+)?\n([^\`]+)\n\`{3}/g;

  json = json.replace(regex, '$2');

  fs.writeFileSync('results/' + file + '.json', json);

  return JSON.parse(json);
}

let messages = [{ role: 'system', content: 'Answer questions based on the following JSON representation of a flowchart. Make sure to be careful between yes and no\'s and follow the correct ID numbers. When answering, give only the specific ID number you\'re referring to. DO NOT give the content of that item or anything else. Do not answer the question directly, only give the state ID. Do NOT use any formatting.'}];

let messages2 = [{ role: 'user', content: [
  { type: 'text', text: 'Answer questions given the following flowchart. Answer the questions ONLY with the text contained within the singular next item in the flowchart. If the next action is a question, give me the question not a statement. Don\'t add any input other than that that\'s already there. Also don\'t use any formating in your response.'},
  { type: 'image_url', image_url: { 'url': base64_encode('images/' + 'medical.png') }}
]}];

const AskUnguidedQuestion = async(question) => {
  messages2.push({ role: 'user', content: question });

  let completion = await openai.chat.completions.create({
    messages: messages2,
    model: 'gpt-4o'
  });

  return completion.choices[0].message.content;
}

const AskQuestion = async(question, chart) => {
  if (messages.length === 1) {
    messages.push({ role: 'system', content: chart});
  }

  messages.push({ role: 'user', content: question})

  let chatCompletion = await openai.chat.completions.create({
    messages: messages,
    model: 'gpt-4o'
  });

  return chatCompletion.choices[0].message.content;
}


function findStateByKeyValue(key, value, states) {
  return states.states.find(state => state[key] === value);
}

const CheckStates = async(questions, answers, states, test) => {
  console.time("states");
  let correctAmount = 0;
    for (let i = 0; i < questions.length; i++) {
      let thing = questions[i];
      let answer = answers[i]
      let response = await AskQuestion(thing, JSON.stringify(states));
      let isCorrect = Number(response) === answer;

      console.log(`ID: ${response} ${isCorrect ? '✓' : 'X'} ${answer} Content: ${findStateByKeyValue('id', Number(response), states)?.content ?? 'Cannot find content given state.'}`);

      if (isCorrect) {
        correctAmount++;
      }
    }

    console.log(`${correctAmount}/${questions.length} correct. ${(correctAmount/questions.length) * 100}%`);

    console.timeEnd("states");
    return correctAmount;
}

const CheckNormal = async(questions, answers, states) => {
  console.time("normal");
  let correctAmount = 0;

  for (let i = 0; i < questions.length; i++) {
    let thing = questions[i];
    let answer = answers[i];

    let response = await AskUnguidedQuestion(thing);
    let isCorrect = (findStateByKeyValue('content', response, states)?.id ?? 0) === answer;
    if (isCorrect) {
      correctAmount++;
    }

    console.log(`ID: ${findStateByKeyValue('content', response, states)?.id ?? '0'} ${isCorrect ? '✓' : 'X'} ${answer} Content: ${response}`);

    
  }
  console.log(`${correctAmount}/${questions.length} correct. ${(correctAmount/questions.length) * 100}%`)

  console.timeEnd("normal");
  return correctAmount;
}

let chartStates = null;

async function main() {
    // await FlowchartToJson("medical.png");

    chartStates = JSON.parse(fs.readFileSync('results/medical.png.json'));
    
    let questions = fs.readFileSync('questions/medical.png.txt').toString().split('\n');
    let correct = fs.readFileSync('answers/medical.png.txt').toString().split('\n').map(Number);

    console.log(await CheckNormal(questions, correct, chartStates));
}

main();
