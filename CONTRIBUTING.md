Contributing to the Thunderbird Conversations project
=====================================================

We love pull requests from everyone.

* Fork the repository.
* Follow the instructions in the [Development doc](Development.md) to clone, just use the newly clone repository URL for your clone.
* Build & install as per the instructions.
* Make sure the tests pass:

```
npm test
```

* Make your changes on the master branch.
* Test them in Thunderbird and with the tests.
* Consider adding new tests if you're touching code that is already tested, or just if you want to add more tests.

The general coding style we like is contained within the ESLint rules so follow the existing style and rules and if the tests pass you should be fine.

Push to your fork, and submit a pull request. The tests will also run automatically for the pull request, please make sure that they still pass.

At this point you're waiting on us. We may take a few days to comment on your pull request. We may suggest some changes or improvements and alternatives.
