/*
  will contain


    A Lexer
      -takes the original expression string and returns an array of tokens paresed form that string
        ex. 'a + b' -> ['a', '+', 'b']


    An AST Builder
      -takes the array of tokens generated by the lexer, and builds up an abstract syntax tree. The
        tree represents the syntactic structure of the expression as nexted javascript objects
        ex cont from above.

        {
          type: AST.BinaryExpression,
          operator: '+',
          left: {
            type: AST.Identifier,
            name: 'a'
          },
          right: {
            type: AST.Identifier,
            name: 'b'
          }
        }


    An AST Compiler
      -takes the abstract syntax tree and compiles it into a JavaScript function that evaluates the 
        expression represented in the tree.
        ex


    a Parser
      -responsible for combining the low-level steps ^^^. 

 */
////////////////////////////////////////////////////////////////////
//global vals
////////////////////////////////////////////////////////////////////

var ESCAPES = {'n': '\n', 'f':'\f', 'r': '\r', 't':'\t',
                'v': '\v', '\'': '\'', '"': '"' };

var OPERATORS = {
  '+': true,
  '!': true,
  '-': true
};

var CALL = Function.prototype.call;
var APPLY = Function.prototype.apply;
var BIND = Function.prototype.bind;

////////////////////////////////////////////////////////////////////
//parse
//
//creates a lexer which is passed into parser, the same lexer is then passed into AST by Parser
//
////////////////////////////////////////////////////////////////////

function parse(expr) {

  //create a lexer to construct a parser
  var lexer = new Lexer();

  var parser = new Parser(lexer);

  return parser.parse(expr);

}


////////////////////////////////////////////////////////////////////
//Parser
//
//parser can only be instantiated with a lexer
////////////////////////////////////////////////////////////////////

function Parser(lexer) {

  //lexer constructed in parse
  this.lexer = lexer;

  //create new ast with lexer
  this.ast = new AST(this.lexer);


  //create astcompiler with ast

  //we have in the ASTCompiler, the lexer that was constructed in parse
  //an AST with the same lexer on it

  this.astCompiler = new ASTCompiler(this.ast);

}



//compile == parse
Parser.prototype.parse = function(text) {
  return this.astCompiler.compile(text);
};




////////////////////////////////////////////////////////////////////
//AST
//
//AST can only be instantiated with a lexer
////////////////////////////////////////////////////////////////////

function AST(lexer) {
  this.lexer = lexer;
}

//marker constants
AST.Program = "Program";
AST.Literal = "Literal";
AST.ArrayExpression = "ArrayExpression";
AST.ObjectExpression = "ObjectExpression";
AST.Property = "Property";
AST.Identifier = "Identifier";
AST.ThisExpression = "ThisExpression";
AST.MemberExpression = "MemberExpression";
AST.CallExpression = "CallExpression";
AST.AssignmentExpression = "AssignmentExpression";
AST.UnaryExpression = "UnaryExpression";

//AST compilation will be done here
AST.prototype.ast = function(text) {
  //stores lexer tokens in tokens property
  this.tokens = this.lexer.lex(text);


  //builds ast object which is returned
  return this.program();

};

//root of ast
AST.prototype.program = function() {

  return {
    type: AST.Program,
    body: this.assignment()
  };

};

//primary ast building method
AST.prototype.primary = function(){

  var primary;

  if ( this.expect('[') ) {

    primary =  this.arrayDeclaration();

  } else if ( this.expect('{') ){

    primary =  this.object();

  } else if ( this.constants.hasOwnProperty( this.tokens[0].text ) ){

    primary =  this.constants[ this.consume().text ];

  } else if ( this.peek().identifier ){ //lookup the object property

    primary =  this.identifier();

  } else {

    primary =  this.constant();

  }

  // if a dot is found after
  // then primary recursively defines itself with the last lookup node on top;
  // repeat until no more lookups

  var next;

  while ( ( next = this.expect('.', '[', '(') ) ) { // builds AST down to original key with last lookup as parent

    // if computed lookup of an object, finish it
    if ( next.text === '['){

      primary = {
        type: AST.MemberExpression,
        object: primary,
        property: this.primary(),
        computed: true
      };

      this.consume(']');

    } else if ( next.text === '.' ) {

      primary = {
        type: AST.MemberExpression,
        object: primary,
        property: this.identifier(),
        computed: false
      };

    } else if ( next.text === '(' ) {

      primary = {
        type: AST.CallExpression,
        callee: primary,
        arguments: this.parseArguments()
      };

      this.consume(')');

    }
  }

  return primary;

};

AST.prototype.assignment = function(){
  var left = this.unary();
  if ( this.expect('=') ) {
    var right = this.unary();
    var token = { type: AST.AssignmentExpression, left: left, right: right };
    return token;
  }
  return left;
};

AST.prototype.parseArguments = function(){
  var args = [];
  if(!this.peek(')')) {
    do {
      args.push( this.assignment() );
    } while ( this.expect(',') );
  }
  return args;
};

AST.prototype.arrayDeclaration = function(){
  var elements = [];

  //if this is not an empty array
  if( !this.peek(']') ) {

    //parse the inner contents of the array
    do {

      if ( this.peek(']') ) //allow for arrays with trailing commas
        break;

      //parse the element and add it
      elements.push( this.assignment() );

    } while ( this.expect( ',' ) );

  }

  //end the array
  this.consume(']');


  return { type: AST.ArrayExpression, elements: elements };
};


AST.prototype.object = function(){
  var properties = [];

  if( !this.peek('}') ){

    do {

        var property = { type: AST.Property };

        if( this.peek().identifier ){

          property.key = this.identifier();

        } else {

          property.key = this.constant();
        }

        this.consume(':');

        property.value = this.assignment();

        properties.push( property );


    } while( this.expect(',') );

  }
  this.consume('}');

  return { type: AST.ObjectExpression, properties: properties };
};

//have a feeling that this is only very temporary
AST.prototype.constant = function() {

  return {
    type: AST.Literal,
    value: this.consume().value
  };

};

AST.prototype.identifier = function(){
  return { type: AST.Identifier, name: this.consume().text };
};

AST.prototype.constants = {
  'null': { type: AST.Literal, value: null },
  'true': { type: AST.Literal, value: true },
  'false': { type: AST.Literal, value: false },
  'this': { type: AST.ThisExpression }
};


AST.prototype.unary = function(){
  var token = this.expect('+', '!', '-');
  if( token ){
    return {
      type: AST.UnaryExpression,
      operator: token.text,
      argument: this.unary()
    };
  } else {
    return this.primary();
  }
};

//checks if next token is what we expect it to be;
//  takes token off the stack
AST.prototype.expect = function( e1, e2, e3, e4 ){

  var token = this.peek( e1, e2, e3, e4 );

  if ( token )
    return this.tokens.shift();

};

//like expect but throws an exception if not expected
AST.prototype.consume = function(e){

  var token = this.expect(e);

  if( !token )
    throw 'Unexpected. Expecting: ' + e;


  return token;
};

//if no argument given or if the token's text matches the argument
//returns the next token off the stack if there is one
AST.prototype.peek = function( e1, e2, e3, e4 ){

  if ( this.tokens.length > 0 ){

    var text = this.tokens[0].text;

    if ( text === e1 || text === e2 || text === e3 || text === e4 || ( !e1 && !e2 && !e3 && !e4 ) )
      return this.tokens[0];
  }

};


////////////////////////////////////////////////////////////////////
//ASTCompiler
//
//
////////////////////////////////////////////////////////////////////

//astBuilder is an ast instance with the lexer created in parse
function ASTCompiler(astBuilder) {

  //astBuilder is an AST instance
  this.astBuilder = astBuilder;

}



//AST compilation will be done here
ASTCompiler.prototype.compile = function( text ) {

  //lexing is called here
  var ast = this.astBuilder.ast( text );

  this.state = {
    body: [],
    nextId: 0,
    vars: []
  };

  //walk the tree
  this.recurse(ast);

  printObject(this);

  var expr =
    'var fn = function(s,l){ ' +
    (this.state.vars.length ? 'var ' + this.state.vars.join(', ') + ';' : '' ) +
    this.state.body.join(' ') +
    '}; return fn;';

  // console.log(expr);

  /* jshint -W054 */

  //functionally similar to eval which jshint doesn't like
  //  -Why?
  //create javascript from state.body
  return new Function('ensureSafeMemberName', 'ensureSafeObject', 'ensureSafeFunction', 'ifDefined', expr)
  ( ensureSafeMemberName, ensureSafeObject, ensureSafeFunction, ifDefined );


  /* jshint +W054 */

};



/* create - should we be creating objects that don't survive lookup */
ASTCompiler.prototype.recurse = function(ast, context, create ) {

  var intoId;

  switch (ast.type) {

    case AST.Program:

      var lastStatement = this.recurse(ast.body);

      //generate return statement for the whole expression
      this.state.body.push('return ', lastStatement, ';'); //syntax is equivalent to pushing three elements into the array

      break;

    //primatives
    case AST.Literal:

      //a literal is a leaf node of the AST
      return this.escape(ast.value);


    //array literals
    case AST.ArrayExpression:

      //go through the elements of the elements found in the ast
      var elements = _.map( ast.elements, function (element){

        return this.recurse(element);

      }, this);


      return '[' + elements.join(',') + ']';


    //object literals
    case AST.ObjectExpression:


      var properties = _.map( ast.properties, function( property ){

        var key = property.key.type ===  AST.Identifier ? property.key.name : this.escape( property.key.value ),

        value = this.recurse( property.value );

        return key +  ':' + value;
      }, this );

      return '{ ' + properties.join(', ') + ' }';


    //lookup on locals or scope
    case AST.Identifier:
      ensureSafeMemberName( ast.name );

      intoId = this.nextId();

      //locals rather than scope
      this.if_(this.getHasOwnProperty( 'l', ast.name ), this.assign( intoId, this.nonComputedMember( 'l', ast.name ) ));

      if( create ) {
        this.if_(
          //if object does not have own property and scope exists create that property
          this.not( this.getHasOwnProperty('l', ast.name) ) + ' && s &&' +  this.not( this.getHasOwnProperty('s', ast.name)),
          this.assign( this.nonComputedMember('s', ast.name), '{}') );
      }

      this.if_(this.not( this.getHasOwnProperty( 'l', ast.name ) ) + ' && s',
        this.assign( intoId, this.nonComputedMember('s', ast.name) ) );

      if( context ) {
        context.context = this.getHasOwnProperty('l', ast.name) + '? l : s';
        context.name = ast.name;
        context.computed = false;
      }
      this.addEnsureSafeObject( intoId );
      return intoId;


    // this keyword, refers to scope
    case AST.ThisExpression:
      return 's';

    case AST.MemberExpression:
      intoId = this.nextId();

      //recurse on object to create
      var left = this.recurse( ast.object, undefined, create );


      if (context) {
        context.context = left; //owning object of the member expression
      }

      if( ast.computed ){
        //since property for the computed lookup is an expression, recurse into it
        var right = this.recurse( ast.property );

        this.addEnsureSafeMemberName(right);

        if ( create ) {
          this.if_( this.not( this.computedMember(left, right) ),
            this.assign( this.computedMember(left, right), '{}'));
        }

        this.if_(left,
          this.assign( intoId,
            ' ensureSafeObject( ' + this.computedMember(left, right) + ' ) ' ) );

        if( context ) {
          context.name = right;
          context.computed = true;
        }

      } else {
        ensureSafeMemberName( ast.property.name );

        if ( create ) {
          this.if_( this.not( this.nonComputedMember(left, ast.property.name) ),
            this.assign( this.nonComputedMember(left, ast.property.name), '{}'));
        }

        this.if_( left,
          this.assign( intoId, 
            'ensureSafeObject( ' + this.nonComputedMember( left, ast.property.name ) + ' )' ) );

        if( context ) {
          context.name = ast.property.name;
          context.computed = false;
        }

      }

      return intoId;

    case AST.CallExpression:
      var callContext = {};
      var callee = this.recurse(ast.callee, callContext);

      var args = _.map( ast.arguments, function(arg){
        return 'ensureSafeObject( ' + this.recurse(arg) + ')';
      }, this);

      if ( callContext.name ) {

        if ( callContext.computed ) {
          this.addEnsureSafeObject(callContext.context);
          callee = this.computedMember(callContext.context, callContext.name);
        } else {
          callee = this.nonComputedMember(callContext.context, callContext.name);
        }
      }
      this.addEnsureSafeFunction(callee);
      return callee + ' && ensureSafeObject(' + callee + '(' +  args.join(', ')  +') )';

    case AST.AssignmentExpression:
      var leftContext = {};
      this.recurse( ast.left, leftContext, true );

      var leftExpr;
      if(leftContext.computed){
        leftExpr = this.computedMember( leftContext.context, leftContext.name );
      } else {
        leftExpr = this.nonComputedMember( leftContext.context, leftContext.name );
      }

      return this.assign( leftExpr,
        'ensureSafeObject(' + this.recurse(ast.right) + ')' );

    case AST.UnaryExpression:
      return ast.operator + '( ' + this.ifDefined( this.recurse( ast.argument ), 0 ) + ' )';
  }

};




ASTCompiler.prototype.escape = function(value) {

  if( _.isString(value) ){

    return '\'' + value.replace(this.stringEscapeRegex, this.stringEscapeFn) + '\'';

  } else if( _.isNull(value) ) {

    return 'null';

  } else {

    return value;

  }

};

ASTCompiler.prototype.addEnsureSafeFunction = function( expr ){
  this.state.body.push('ensureSafeFunction( ' + expr + ' );');
};

ASTCompiler.prototype.addEnsureSafeMemberName = function( expr ){
  this.state.body.push('ensureSafeMemberName( ' + expr + ' );');
};

ASTCompiler.prototype.addEnsureSafeObject = function( expr ){
  this.state.body.push('ensureSafeObject( ' + expr + ');');
};

//creates seqential variables for compilation
ASTCompiler.prototype.nextId = function(){
  var id = 'v' + ( this.state.nextId++ );
  this.state.vars.push(id);
  return id;
};

//to avoid undefined lookup call errors,
//will be put into state.body
ASTCompiler.prototype.if_ = function(test, consequent){

  this.state.body.push(' if(', test, '){', consequent, '}' );

};

ASTCompiler.prototype.not = function(e){
  return ' !( ' + e + ' ) ';
};


ASTCompiler.prototype.assign = function( id, value ){
  return id + ' = ' + value + '; ';
};

//compiles string for lookup on left of right
//left = parent, right = child
ASTCompiler.prototype.nonComputedMember = function( left, right ){ //dot notation
  return '(' + left + ').' + right;
};

ASTCompiler.prototype.computedMember = function( left, right ){ //bracket notation
  return '(' + left + ')[ ' + right + ' ] ';
};

ASTCompiler.prototype.getHasOwnProperty = function(object, property){
  return object + ' && (' + this.escape( property ) + ' in ' + object + ') ';
};

ASTCompiler.prototype.stringEscapeRegex = /[^ a-zA-Z0-9]/g;


ASTCompiler.prototype.stringEscapeFn = function(c){

  return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);

};

ASTCompiler.prototype.ifDefined = function(value, defaultValue){
  return 'ifDefined( ' + value + ', ' + this.escape( defaultValue ) + ' )';
};

//safety methods
function ifDefined(value, defaultValue){
  return typeof value === 'undefined' ? defaultValue : value;
}

function ensureSafeFunction(obj){
  if( obj ){
    if( obj.constructor === obj ){
      throw 'Referencing Function in Angular is not allowed! Shame on you!';
    } else if( obj === CALL || obj === APPLY || obj === BIND){
      throw 'Referencing call, apply, or bind is not allowed! Shame on you!';
    }
  }
  return obj;
}

function ensureSafeObject(obj){
  if( obj ){
    if( obj.window === window ){
      throw "Referencing window in Angular expressions is disallowed! Shame on you!";
    } else if (obj.children && ( obj.nodeName || ( obj.prop && obj.attr && obj.find) ) ){
      throw "Referencing DOM nodes is not allowed! Shame on your family!";
    } else if (obj.constructor === obj ){
      throw "Referencing Function is not allowed! Shame on you!";
    } else if (obj === Object){
      throw "Referencing Object is not allowed! Shame on you!";
    }
  }
  return obj;
}


function ensureSafeMemberName(name){
  if( name === 'constructor' || name === '__proto__' || name === '__defineGetter__' ||
      name === '__defineSetter__' || name === '__lookupGetter__' || name === '__lookupSetter__' )
    throw 'Attempting to access disallowed fields! Shame on you!';
}

////////////////////////////////////////////////////////////////////
//Lexer
//
//creates tokens, so far handles literals
////////////////////////////////////////////////////////////////////

function Lexer() {

}


//Tokenization will be done here
//returns tokens from text
Lexer.prototype.lex = function(text) {

  this.text = text;

  //index in the string
  this.index = 0;
  //current character
  this.ch = undefined;

  this.tokens = [];

  while ( this.index < this.text.length ) {

    this.ch = this.text.charAt( this.index );

    if ( this.isNumber( this.ch ) ||
      ( this.is('.') && this.isNumber( this.peek() ) ) ) {
      this.readNumber();

    } else if( this.is('\'"') ){

      this.readString( this.ch );

    } else if( this.is('[],{}:.()=') ) {  //if object or array character, or function invocation 

      this.tokens.push({
        text: this.ch
      });

      this.index++;


    } else if( this.isIdent( this.ch ) ){

      this.readIdent();

    } else if( this.isWhitespace( this.ch ) ){

      this.index++;

    } else {
      var op = OPERATORS[this.ch];
      if (op){
        this.tokens.push({text: this.ch});
        this.index++;
      } else {
        throw "unexpected next character: " + this.ch;
      }

    }

  }

  return this.tokens;

};

Lexer.prototype.is = function(chs){
  return chs.indexOf( this.ch ) >=0;
};

//function to handle comparison if character is a number
Lexer.prototype.isNumber = function(ch) {

  return '0' <= ch && '9' >= ch;

};

Lexer.prototype.isIdent = function(ch){
  return ( ch >= 'a' && ch <= 'z' ) || ( ch >= 'A' && ch <= 'Z' ) ||
  ch === '_' || ch === '$';
};

Lexer.prototype.isWhitespace = function(ch) {
  return ch === ' ' || ch === '\r' || ch === '\t' ||
         ch === '\n' || ch === '\v' || ch === '\u00A0';
};

//function to handle literal/exponentional number parsing
Lexer.prototype.readNumber = function() {

  var number = '';

  while (this.index < this.text.length) {

    var ch = this.text.charAt(this.index).toLowerCase();

    if ( ch === '.' || this.isNumber(ch) ) {
      number += ch;

    } else {
      //handles scientific notation
      var nextCh = this.peek();

      var prevCh = number.charAt(number.length - 1);

      if(ch === 'e' && this.isExpOperator(nextCh)){

        number += ch;

      } else if ( this.isExpOperator(ch) && prevCh === 'e' && nextCh && this.isNumber(nextCh) ){
        number += ch;

      } else if( this.isExpOperator(ch) && prevCh === 'e' && ( !nexCh || !this.isNumber(nextCh) ) ){

        throw "Invalid exponent";

      } else{
        break;
      }
    }

    this.index++;
  }

  this.tokens.push({
    text: number,
    value: Number(number)
  });
};

//identifier
Lexer.prototype.readIdent = function(){

  var text = '';

  while ( this.index < this.text.length ){

    var ch = this.text.charAt(this.index);

    if( this.isIdent(ch) || this.isNumber(ch) ){

      text += ch;

    } else {

      break;

    }

    this.index++;

  }

  var token = { text: text, identifier: true };

  this.tokens.push(token);

};

Lexer.prototype.readString = function(quote){

  this.index++;

  var string = '';

  var rawString = quote;

  var escape = false;

  while(this.index < this.text.length){

    var ch = this.text.charAt(this.index);

    rawString += ch;

    if(escape){

      //handle unicode
      if(ch === 'u'){

        var hex = this.text.substring(this.index + 1, this.index + 5);

        if(!hex.match(/[\da-f]{4}/i))
          throw 'Invalid unicode escape';

        this.index += 4;

        string += String.fromCharCode(parseInt(hex, 16));

      } else {

        var replacement = ESCAPES[ch];

        if(replacement){

          string += replacement;

        } else {

          string += ch;

        }

      }

      escape = false;

    } else if (ch === quote){

      this.index++;

      this.tokens.push({
        text: rawString,
        value: string
      });

      return;

    } else if (ch === '\\') {

      escape = true;

    } else {
      string += ch;
    }

    this.index++;

  }
  throw 'Unmatched quote';
};

//this function looks ahead one index, if applicable, and returns that character
Lexer.prototype.peek = function(){
  return this.index < this.text.length - 1 ?
    this.text.charAt(this.index + 1) :
    false;
};

Lexer.prototype.isExpOperator = function(ch){
  return ch === '-' || ch === '+' || this.isNumber(ch);
};


function printObject(obj){
  if(typeof(obj) !== 'object')
    return;
  var str = '{\n';
  recurse(obj);
  str += '}\n';


  function recurse (ob){

    for( var key in ob ){
      str += ' ' +  key  + ': ';

      if(typeof(ob) === 'object' && !Array.isArray(ob[key]))
        str += recurse(ob[key]) + '\n';
      else
        str += '' +  ob[key] + '\n';

    }
  }
}