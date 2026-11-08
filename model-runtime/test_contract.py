"""Contract tests require no model weights or GPU."""
import runtime_test_path
import json
import os
from pathlib import Path
import subprocess
import unittest
from contract import RequestError, normalize_chat, parse_json


class ContractTests(unittest.TestCase):
    def body(self, **changes):
        return dict(model='petya-v1', messages=[{'role':'user','content':'Сохрани имя «Счёт_0046».'}], **changes)

    def test_real_application_request(self):
        root = Path(__file__).resolve().parent.parent
        node = root / 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
        script = "const {dialogueRequest}=require('./src/dialogue-request.cjs');console.log(JSON.stringify(dialogueRequest({model:'petya-v1',command:'Какие требования действуют?',topic:{messages:[]},company:'Проверка'})))"
        raw = subprocess.check_output([str(node), '-e', script], cwd=root, env={**os.environ, 'ELECTRON_RUN_AS_NODE':'1'})
        body = parse_json(raw)
        request = normalize_chat(body, 'petya-v1')
        self.assertEqual(request.messages, body['messages'])
        self.assertEqual(request.schema, body['format'])
        self.assertEqual((request.temperature, request.top_p, request.repeat_penalty), (0.6, 0.9, 1.1))
        self.assertEqual((request.context_tokens, request.max_tokens, request.stream), (16384, 2048, False))

    def test_history_and_input_are_not_rewritten(self):
        body=self.body(stream=False,format={'type':'object'})
        before=json.dumps(body,ensure_ascii=False)
        request=normalize_chat(body,'petya-v1')
        self.assertEqual(json.dumps(body,ensure_ascii=False),before)
        body['messages'][0]['content']='changed'
        body['format']['type']='array'
        self.assertIn('Счёт_0046',request.messages[0]['content'])
        self.assertEqual(request.schema,{'type':'object'})

    def test_json_mode_distinct_from_unconstrained(self):
        self.assertEqual(normalize_chat(self.body(format='json'),'petya-v1').schema,{})
        self.assertIsNone(normalize_chat(self.body(),'petya-v1').schema)

    def test_unsupported_features_are_not_silently_ignored(self):
        for update in [dict(think=True),dict(tools=[]),dict(keep_alive='5m'),dict(options={'stop':['x']}),dict(messages=[{'role':'user','content':'x','images':['x']}])]:
            body=self.body();body.update(update)
            with self.subTest(update=update),self.assertRaises(RequestError):normalize_chat(body,'petya-v1')

    def test_invalid_numbers_and_types(self):
        for key,value in [('temperature',float('nan')),('top_p',2),('num_predict',-1),('num_ctx',True),('repeat_penalty',0),('seed',-1),('top_k',1.5),('temperature',float('inf')),('num_ctx',10**1000)]:
            with self.subTest(key=key,value=value),self.assertRaises(RequestError):normalize_chat(self.body(options={key:value}),'petya-v1')

    def test_context_is_rejected_not_truncated(self):
        request=normalize_chat(self.body(options={'num_ctx':100,'num_predict':20}),'petya-v1')
        request.check_context(80)
        with self.assertRaises(RequestError):request.check_context(81)

    def test_penalty_window_and_disable(self):
        request=normalize_chat(self.body(),'petya-v1')
        self.assertEqual(request.generation_settings()['penalties'],{'repetition_penalty':1.1,'repetition_context_size':64})
        disabled=normalize_chat(self.body(options={'repeat_last_n':0}),'petya-v1')
        self.assertIsNone(disabled.generation_settings()['penalties']['repetition_penalty'])

    def test_invalid_json(self):
        for value in ['{"x":1,"x":2}','{"x":NaN}','{"x":Infinity}','{"x":1e999}','{']:
            with self.subTest(value=value),self.assertRaises(RequestError):parse_json(value)

    def test_wrong_model_and_stream_type(self):
        with self.assertRaises(RequestError):normalize_chat(self.body(),'different')
        with self.assertRaises(RequestError):normalize_chat(self.body(stream='false'),'petya-v1')


if __name__=='__main__':unittest.main()
