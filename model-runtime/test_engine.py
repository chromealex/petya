"""Exercise the real orchestration with a fake token source, without GPU work."""
import runtime_test_path
import threading
from types import SimpleNamespace, ModuleType
import sys
from unittest.mock import patch
import unittest
from engine import GenerationEngine, GenerationError, GenerationCancelled, validate_schema, MLXBackend
from contract import RequestError


class Backend:
    def __init__(self, pieces=None):
        self.pieces=pieces or ['{"answer":','"Привет"}']
        self.calls=[];self.closed=False
    def prompt(self,messages):self.calls.append(('prompt',messages));return [1,2,3]
    def compile(self,schema):
        grammar=object();self.calls.append(('compile',schema,grammar));return grammar
    def generate(self,prompt,settings,grammar,seed):
        self.calls.append(('generate',prompt,settings,grammar,seed))
        try:
            for i,text in enumerate(self.pieces):
                yield SimpleNamespace(text=text,finish_reason='stop' if i==len(self.pieces)-1 else None,prompt_tokens=3,generation_tokens=i+1)
        finally:self.closed=True


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.backend=Backend();self.engine=GenerationEngine(SimpleNamespace(name='petya-development'),self.backend)
        self.body={'model':'petya-development','messages':[{'role':'user','content':'Привет'}],'stream':False,'format':{'type':'object','properties':{'answer':{'type':'string'}},'required':['answer'],'additionalProperties':False},'options':{'temperature':0.6,'top_p':0.9,'repeat_penalty':1.1,'seed':17}}

    def test_settings_schema_and_single_template(self):
        result=self.engine.complete(self.body)
        self.assertEqual(result['message']['content'],'{"answer":"Привет"}')
        self.assertTrue(result['done']);self.assertEqual(result['done_reason'],'stop')
        self.assertEqual(sum(c[0]=='prompt' for c in self.backend.calls),1)
        call=self.backend.calls[-1]
        self.assertEqual(call[2]['sampler'],{'temp':0.6,'top_p':0.9,'top_k':40})
        self.assertEqual(call[2]['penalties']['repetition_context_size'],64)
        self.assertEqual(call[-1],17);self.assertIs(call[3],self.backend.calls[-2][2])

    def test_generic_json_is_constrained_and_accepts_array(self):
        self.body['format']='json';self.backend.pieces=['[1,2]']
        self.assertEqual(self.engine.complete(self.body)['message']['content'],'[1,2]')
        self.assertEqual(next(c[1] for c in self.backend.calls if c[0]=='compile'),{})

    def test_bad_or_truncated_json_never_reports_success(self):
        for text in ['{"answer":','{"answer":3}','{"answer":"x","answer":"y"}']:
            with self.subTest(text=text):
                self.backend.pieces=[text];chunks=[]
                with self.assertRaises(GenerationError):
                    for chunk in self.engine.stream(self.body):chunks.append(chunk)
                self.assertFalse(any(c['done'] for c in chunks));self.assertFalse(self.engine.lock.locked())

    def test_cancel_before_generation(self):
        cancel=threading.Event();cancel.set()
        with self.assertRaises(GenerationCancelled):self.engine.complete(self.body,cancel)
        self.assertEqual(self.backend.calls,[]);self.assertFalse(self.engine.lock.locked())

    def test_cancel_midstream_closes_source(self):
        cancel=threading.Event();stream=self.engine.stream(self.body,cancel)
        next(stream);cancel.set()
        with self.assertRaises(GenerationCancelled):next(stream)
        self.assertTrue(self.backend.closed);self.assertFalse(self.engine.lock.locked())

    def test_busy_and_client_close(self):
        stream=self.engine.stream(self.body);next(stream)
        with self.assertRaisesRegex(GenerationError,'занята'):self.engine.complete(self.body)
        stream.close();self.assertTrue(self.backend.closed);self.assertFalse(self.engine.lock.locked())
        self.assertTrue(self.engine.complete(self.body)['done'])

    def test_fresh_grammar_per_request(self):
        self.engine.complete(self.body);self.engine.complete(self.body)
        grammars=[c[2] for c in self.backend.calls if c[0]=='compile']
        self.assertIsNot(grammars[0],grammars[1])

    def test_external_schema_reference_and_invalid_schema(self):
        for schema in [{'$ref':'https://example.com/schema.json'},{'type':'wrong'}]:
            with self.subTest(schema=schema),self.assertRaises(RequestError):validate_schema(schema)

    def test_mlx_boundary_composes_penalty_before_grammar(self):
        calls={};mx=ModuleType('mlx.core');mx.random=SimpleNamespace(seed=lambda seed:calls.update(seed=seed))
        mlx=ModuleType('mlx');mlx.core=mx
        lm=ModuleType('mlx_lm');lm.stream_generate=lambda *args,**kwargs: calls.update(args=args,kwargs=kwargs) or iter(())
        sampling=ModuleType('mlx_lm.sample_utils')
        sampling.make_sampler=lambda **kwargs: calls.update(sampler=kwargs) or 'sampler'
        sampling.make_logits_processors=lambda **kwargs: calls.update(penalties=kwargs) or ['penalty']
        backend=object.__new__(MLXBackend);backend.model='model';backend.tokenizer='tokenizer';backend.vocab_size=100
        settings={'sampler':{'temp':0.6,'top_p':0.9,'top_k':40},'penalties':{'repetition_penalty':1.1,'repetition_context_size':64},'max_tokens':256}
        with patch.dict(sys.modules,{'mlx':mlx,'mlx.core':mx,'mlx_lm':lm,'mlx_lm.sample_utils':sampling}):
            backend.generate([1,2],settings,'grammar',17)
            self.assertEqual(calls['kwargs']['logits_processors'],['penalty','grammar'])
            self.assertEqual(calls['kwargs']['prompt'],[1,2])
            self.assertEqual(calls['sampler'],settings['sampler']);self.assertEqual(calls['penalties'],settings['penalties'])
            self.assertEqual(calls['seed'],17)
            settings['sampler']['top_k']=101
            with self.assertRaises(RequestError):backend.generate([1,2],settings,'grammar',17)

    def test_context_overflow_never_generates(self):
        self.body['options']={'num_ctx':4,'num_predict':2}
        with self.assertRaises(RequestError):self.engine.complete(self.body)
        self.assertFalse(any(c[0]=='generate' for c in self.backend.calls))
        self.assertFalse(self.engine.lock.locked())


if __name__=='__main__':unittest.main()
