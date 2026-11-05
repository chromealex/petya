// Throw only before side effects, or resume the exact unfinished step. Never replay a write.
class InputRequired extends Error {
 constructor(spec,resume){super(spec.text);this.name='InputRequired';this.spec=spec;this.resume=resume;}
}
function ask(spec,resume){throw new InputRequired(spec,resume);}
module.exports={InputRequired,ask};
